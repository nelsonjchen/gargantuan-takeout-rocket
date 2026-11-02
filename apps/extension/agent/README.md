# GTR agent service

This is a local transfer service with its own durable jobs and Unix-socket API.
It is **not** a proxy for the extension popup, worker storage, browser profile,
or arbitrary browser commands. It does not import or inspect legacy extension
history. Existing unknown attempts can be listed as reservations in its reviewed
policy; absence in Azure never releases those reservations.

The extension can optionally submit **new** eligible Takeout downloads through
an origin-restricted native messaging host. After durable acknowledgement, the
service owns planning, remote range copies, retries, commit verification, and
progress. This continues independently of the browser's worker and DevTools.
Source sign-in and initial selection of an export remain in the browser.

This is a starting point for your own periodic Takeout automation. The supplied
installer and the author's live workflow are tuned to macOS and Edge, with an
external agent using an unlocked 1Password for Google passkeys. The service's
transfer engine does not require AI or 1Password. Other users may need their own
reauthentication solution; see [authentication and manual fallback](../AUTOMATION.md#authentication-and-manual-fallback).

## Interface

The installed `gtr-agent` command exposes:

```text
gtr-agent status
gtr-agent pause
gtr-agent resume
gtr-agent retry --job archive.zip
gtr-agent reconcile-reservations
```

Responses are JSON. `status` reports only service-owned jobs, their progress,
blocked states and explicitly configured reservations. It never returns source
URLs, cookies, SAS values, or browser history. `retry` applies only to stopped
service-owned jobs. Reconciliation releases an old reservation only if Azure
HEAD positively confirms a committed blob; it does not claim source checksum
verification or treat a missing blob as a failed transfer.

Mutating commands accept `--request-id` with 32 lowercase hex characters. Reuse
that ID after a lost response. Receipts are persisted before action, and finished
receipts are never evicted automatically. A started but unfinished receipt returns
`outcome_unknown` rather than re-executing. The journal stops accepting new writes
at 4096 receipts instead of silently losing deduplication guarantees.

There are two filesystem sockets, both mode 0600 inside a mode 0700 directory:

- `control.sock`: status, pause, resume, retry, reservation reconciliation.
- `ingest.sock`: new-job submission and a limited capacity response for Takeout
  discovery. The native host accepts no extension-observation or control command.

The capacity response includes `archiveLimit`, `unfinishedJobs`, `availableSlots`,
`paused` and `needsAttention`. Completion uses the unfinished-job count, not a
comparison with the browser's fixed three-file limit. Rebuild/update the service
and extension together: the extension rejects older capacity replies that lack
the completion metadata rather than guessing whether transfers finished. Perform
an upgrade after pausing and draining active work, using the reviewed installation
procedure; the installer does not overwrite an existing service automatically.

There is no HTTP listener, public URL, port forwarding or bearer token. Processes
running as the same macOS user can operate this service. Browser access to the
native host is restricted to the exact reviewed extension origin.

## Installation and approval boundary

Use existing Node.js 22+ and Python 3. No new packages are installed.

```sh
pnpm --dir apps/extension agent:build
python3 apps/extension/agent/install.py \
  --extension-id EXISTING_EXTENSION_ID \
  --policy /path/to/reviewed-policy.json
```

The default is a dry run. The credential-free policy contains the existing Azure
container identity, existing HTTPS proxy, and any unresolved filename reservations.
The installer refuses to replace an existing service or native host registration.

After specific approval for local access, `--apply` installs the bundled service
and registers its native host for the existing Edge extension. It does not start
the service or grant browser permission. Start the installed `gtr-agent serve`
command, then enable **Native handoff** in the updated extension and accept its
optional `nativeMessaging` permission. This is a new access grant: the local
service receives expiring Google source URLs/cookie bundles and the existing Azure
SAS for new jobs, and processes under the user's account can operate those jobs.
Do not enable it without that approval.

The popup now checks an actual native roundtrip before enabling handoff. Its
**Check local connection** button can test an already-enabled setup without
sending download URLs, cookies or SAS values. It reports fixed codes for missing
permission, missing host, denied access, launch failure and early host exit;
arbitrary browser error text is not echoed. Popup-only updates take effect on
reopening the popup, without reloading the worker or interrupting jobs.

For example, after the reviewed installation, start the service in a terminal:

```sh
GTR_AGENT="$HOME/Library/Application Support/GTR/agent/gtr-agent"
"$GTR_AGENT" serve --archive-limit 3 --blocks-per-file 3 --block-mib 1024
```

Keep that process running. This example chooses 1 GiB blocks; omitting
`--block-mib` uses 256 MiB. A fresh installation starts paused; a restart restores
its saved pause state. `resume` does not discard reservations or change the
storage policy. New jobs are limited to the configured container and proxy, and
the API has no destination, retention, credential-generation, deletion or code
execution command. A filename cannot silently switch to a different source object.
Unknown native handoffs never fall back to another browser transfer. A fresh
native capture can refresh authorization for the same source object when its
service job is queued, waiting or blocked and has no active requests. It preserves the
job ID and saved block plan rather than creating another transfer.

## Persistence and recovery

Job plans are saved before copying; Azure is reconciled before missing blocks
are staged with the original IDs and ranges. Commits are conditional and verified
by byte count and an opaque job marker. The default three unfinished archives share
capacity with explicit old reservations. An approved run can use
`gtr-agent serve --archive-limit 6` for up to six; values outside 1–6 are rejected.
The runtime limit is reported by `status`, enforced atomically on submission, and
used by source discovery. It does not extend Google access: every subsequent block
request still needs valid authorization. Requests use the same bounded transfer engine as
the extension, with 256 MiB server-side ranges by default and bounded batch concurrency.
For larger server-side copy requests, an approved run can use
`gtr-agent serve --archive-limit 3 --block-mib 1024`. This plans 1 GiB ranges for
new jobs only; existing saved ranges and IDs never change. Values must be multiples
of 256 MiB, up to 3072 MiB. Browser requests keep their 25-second deadline; the native
service's deadline starts at 75 seconds and scales with the requested block size,
capped at five minutes. Larger ranges increase the amount retried after a failure;
a live larger-block copy still needs verification.
Last confirmed staged counts survive retry errors and are refreshed from Azure.

For an approved concurrency comparison, `--blocks-per-file 2 --archive-limit 4`
allows four unfinished files with at most eight simultaneous block-copy requests.
The default remains three files with three requests each. `--blocks-per-file`
accepts integers from 1 to 3 and changes batch width only; saved ranges and block
IDs are preserved. Status reports `blocksPerFile` and `maxCopyRequests`.

These are startup options for this service. They do not change the browser queue
or existing block ranges. Change them only after pausing and draining issued
requests, stopping the service cleanly, and restarting it with the same private
state directory and policy. Keep the one-shot producer stopped during that
transition; otherwise it may be holding stale authorization or capacity assumptions.
The service waits for each selected group of file batches to settle before its
next tick, so a slow request can delay other files. More files in flight therefore
does not guarantee a higher aggregate rate.

In the November 2026 live comparison, three files with three requests each averaged
about 187 MB/s before a four-file/two-request window averaged about 200 MB/s for an
hour. Later throughput fell and HTTP 524 timeouts increased, so the run returned
to three files/three requests. These were different files and time windows, not a
controlled benchmark or proof of a permanent speedup. The block plans stayed at
1 GiB throughout that comparison; larger blocks do not extend Google's access
window and increase the work repeated after a timeout.

The private state file is atomically replaced and fsynced, including its directory.
Cookie/source/SAS authorization is cleared from completed entries. An unrecoverable
storage failure pauses new work. A kernel-held lease prevents competing service
instances and releases on process death, allowing stale socket recovery without
deleting a live service's endpoint. Hard-crash restart and receipt preservation
are covered by the native-protocol integration test.

This version runs while its service process is running. It does not install a
launch agent, recurring monitor, browser policy override or new credential. A
computer reboot requires starting the service again. Google auth challenges and
expired Azure access still need authorized renewal; the API does not bypass them.

## Queue an approved export

`export_queue.py` is a one-shot source-discovery client for this same service.
It takes a manifest copied from the visible Google export (filenames, indexes,
displayed sizes, known committed byte counts, and explicit uncertain-part holds).
It derives source URLs only from an unfinished service-owned job in that exact
Google export. Its authentication copy stays in process memory; the manifest
and progress journal contain no cookies, SAS values or source URLs.

The manifest must list the complete export in Google part order, with consecutive
one-based `part` numbers, unique filenames and displayed sizes normalized to MiB.
`exportId` identifies that one export, `holdParts` excludes explicitly uncertain
parts, and `knownCommitted` maps previously verified filenames to exact byte counts.
Create the manifest and its parent directory privately (file mode 0600, directory
0700). Keep real export identities and inventories outside the checkout. Discovery
currently supports Google's verified `takeout-download.usercontent.google.com`
source shape with the expected export/index/account query fields; unfamiliar
source shapes stop rather than being guessed.

```sh
python3 agent/export_queue.py --manifest /private/source-manifest.json \
  --auth-job existing-unfinished-archive.zip \
  --journal /private/export-queue.json --resume
```

Run that command from `apps/extension` in a separate terminal from the service.
Replace `existing-unfinished-archive.zip` with the exact service-owned filename;
the command does not accept a passkey, cookie or SAS on the command line. It runs
in the foreground. If an agent's command session may end, the caller must arrange
an appropriate supervised or detached one-shot process and a private log. No
production launcher or recurring monitor is installed by this repository.

After Google access expires:

1. Let the producer stop and the service's outstanding requests settle. Check
   `status`; the popup's old history is not authoritative for service-owned jobs.
2. Complete normal Google sign-in, manually or with a separately authorized agent,
   and capture an unfinished file from this export with native handoff enabled.
   Reconcile an unknown submission before requesting another download.
3. Restart the producer using the same manifest and journal and the freshly
   captured unfinished filename as `--auth-job`. `--resume` lets it resume a paused
   service after its source and saved-length checks succeed.
4. Verify new staged blocks or a committed file, preserving saved plans. Final
   completion still needs an independent manifest-to-Azure inventory check.

The runner copies authorization into its own process memory. Updating service
authorization does not update an already-running producer; restart that producer
after it stops. Completed jobs have cleared their source and authorization and
cannot be used as `--auth-job`. Unknown request receipts and explicit holds are
never silently discarded. Azure absence alone cannot establish that a legacy
browser job stopped; the service has no legacy-history migration or observation API.

The client verifies known backups in Azure, checks source headers and displayed
sizes, and asks the existing private ingress API to create jobs. It independently
checks its first direct commit before continuing, limits unfinished jobs to the
capacity reported by the service, and prioritizes smaller parts. Submission enforces that capacity
atomically, including reservations. An unknown submission response stops the
client for reconciliation rather than replaying it. Uncertain parts remain held.

This adds no recurring monitor, launch agent, public endpoint, browser/profile
access or credential renewal. Google sign-in pages and expired Azure access stop
discovery and pause new batches. A fresh approved native capture can supply the
next run's access; existing service-owned plans and staged bytes are preserved.
Before resuming an idle queue, the client verifies that access against Google and
can refresh its existing idle jobs in the same account and export. It checks saved
source lengths and preserves job IDs and block plans. Active requests must finish
before that refresh; it never creates or renews credentials.

The native framing and origin registration follow the official
[Chrome native messaging protocol](https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging)
and [Microsoft Edge native messaging interface](https://learn.microsoft.com/en-us/microsoft-edge/extensions/developer-guide/native-messaging).

## Tests

```sh
pnpm --dir apps/extension agent:typecheck
pnpm --dir apps/extension agent:test:host
pnpm --dir apps/extension agent:test:e2e
pnpm --dir apps/extension test -- --runInBand --watchman=false
```

IPC tests use temporary user-only sockets, fake credentials and a paused service.
They do not register a browser host, read extension state, or perform a live cloud
transfer. The capacity end-to-end case carries actual native frames through the
host and service, then checks the reply with the extension's real validator. It
covers idle and unfinished jobs, including a changed file limit after restart.
Live new-job handoff and Azure commit verification remain activation
checks after approval.
