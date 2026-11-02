# Resumable Takeout backups

The optional [agent service](agent/README.md) provides an independent durable
transfer owner and local API for newly handed-off downloads. It requires separate
native-messaging approval; the browser queue described below remains the default.
These are separate job owners. The popup's browser queue controls do not pause
the local service, and its history does not mirror service progress. Use
`gtr-agent status` for service-owned jobs.

The extension now saves a transfer queue in trusted `chrome.storage.local`.
Archive bytes still flow through the configured private proxy into the configured
Azure container using range copies. The queue does not download archive bodies
to the local computer, change retention, create credentials, or change the destination.

## Enable an export

After updating and reloading the **same installed extension**, refresh the Google
Takeout archive page. Expand its download list, then select **Back up this export
automatically** in the Takeout Rocket control at the top of that page. This
explicitly enables that export only. Keep the browser and Takeout page open;
Google may require sign-in in the newly opened download tab. The page requests
the next part when a transfer slot becomes available. **Pause new parts** stops
further Google navigation; **Pause queue** in GTR stops further transfer batches.
Already-issued requests finish before pause takes effect.

The extension requires the new `alarms` permission and Chrome/Edge 102 or later.
It recreates one named, one-minute recovery alarm when the worker starts. This
is internal recovery for the existing extension, not a new Codex scheduled task.
The existing external monitor is not changed by this implementation.

## Recovery guarantees and limits

- Up to three unfinished archive jobs own transfer slots. Retry waits and
  unconfirmed legacy transfers keep their reservations.
- A plan, including randomly generated block IDs and byte ranges, is persisted
  before any Azure copy. Each step stages at most three 256 MiB ranges. This
  deliberately replaces the old all-at-once 3 GiB requests to fit Chromium's
  worker fetch-response window more reliably.
- Network requests, including body reads, have a 25-second abort timeout.
  Transient failures use persisted exponential backoff, up to eight consecutive
  failures. Auth failures and unexpected destination collisions need attention.
- Every step checks Azure first. Only matching block IDs **and** sizes are
  reused. After an unknown response, repeating a missing block uses the same
  ID and range. A failed batch waits for all its issued requests to settle.
- Commit uses `If-None-Match: *` and an opaque `gtr_job` metadata marker. A
  completed job requires a subsequent Azure HEAD matching both its marker and
  planned byte count. An unrelated existing blob is never overwritten or
  accepted as this job's completion.
- An export download request is reserved before opening its Google tab. An
  uncertain request is never automatically opened a second time. Capture is
  acknowledged only when the download's original URL or referrer exactly
  matches that reservation. A browser change in redirect behavior can therefore
  require manual diagnosis instead of silently advancing the export counter.
- Plans can resume after a worker/browser restart. A closed Takeout page pauses
  new-part discovery; already captured jobs continue with browser recovery wakes.
  Computer sleep and browser shutdown suspend execution.
- This does not automate Google's passkey approval, discover/authorize future
  exports, renew Azure credentials, or independently retrieve omission reports.
  Preserve Google's report separately; omissions are not transfer failures.

Chromium documents both worker termination and alarm recovery in its
[worker lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle)
and [alarms](https://developer.chrome.com/docs/extensions/reference/api/alarms)
references. Actual operation without DevTools still needs a browser validation;
mocked recovery tests do not establish that by themselves.

## Legacy jobs and sensitive records

Old `pending` history has no saved source/plan and cannot be safely reconstructed
from randomly named Azure blocks. These records reserve slots. Resolve their
actual GTR/Azure outcome before retrying; the new queue never treats absence
from Azure alone as proof of failure. Legacy `complete` records can be skipped
on a fresh capture only after Azure HEAD confirms the recorded byte count.

Incomplete job records contain expiring Google source URLs. They stay in trusted
extension storage; cookies are obtained at execution time rather than persisted
in queue records, and source URLs are cleared on completion. Azure SAS remains
in the extension's existing masked setting. Status responses exclude source
URLs, cookies and SAS values. Transfer errors use fixed messages rather than
raw remote response bodies. No external messaging or local HTTP control endpoint
is introduced.

## Local service and one-shot discovery

The local service persists its own jobs, plans, authorization and request receipts
in a private directory. It continues copying while its process runs, independently
of the browser worker and DevTools. Its installer currently targets Edge on macOS;
there is no installed launch agent or reboot auto-start.

`agent/export_queue.py` is a separate one-shot producer for one approved export.
It reads a reviewed complete manifest, uses current access from an unfinished
service-owned job, and fills the service's available slots. A private journal and
kernel lock prevent competing producers and replay of uncertain submissions.
Google sign-in expiry stops the producer and pauses new service batches. The
runner can then be restarted with freshly captured access, the same manifest and
journal, preserving job IDs, ranges and staged blocks. See the
[service instructions](agent/README.md#queue-an-approved-export) for commands,
manifest requirements and restart steps. There is no built-in background launcher,
authentication loop, periodic export scheduler or future-export discovery.

The service defaults to three unfinished files, three block requests per file and
256 MiB ranges. `--archive-limit`, `--blocks-per-file` and `--block-mib` are service
startup options, not browser queue settings. Changing range size affects new plans
only; saved plans remain unchanged. The November run used 1 GiB ranges and finished
at the default three-file/three-request limits. A four-file/two-request experiment
reduced the maximum copy requests from nine to eight; its mixed results are in the
[journal](../../BACKUP_JOURNAL.md#november-2026).

## Authentication and manual fallback

The core transfer code can be used manually and does not require AI. Reproducing
the author's unattended workflow currently involves an external agent operating
Edge on macOS and an unlocked 1Password containing the correct Google passkey.
The agent needs permission to use that account's passkey and to send the download
authentication through the chosen trusted proxy to Azure. GTR has no general
1Password/passkey/TOTP login implementation, and its service does not expose
credentials through its status API.

During the November run, an attached page debugger interfered with the visible
1Password sign-in action. Detaching the page debugger and using native Edge
controls allowed the agent to complete repeated passkey cycles. This is an
observed workaround for that setup, not a general claim about all debugged pages
or a portable authentication guarantee. An unlocked manager, correct account,
visible provider action and working computer controls were prerequisites.

If the provider action is missing, 1Password is locked, or user verification is
required, leave jobs paused and ask the user to finish the normal Google sign-in.
After a successful capture of an unfinished service-owned file, let outstanding
requests settle, verify the source still has its saved length, and restart the
one-shot runner with that file's access. Check for actual new blocks or a verified
commit before reporting recovery. A completed job has already cleared its source
access and cannot seed another run. Avoid repeatedly clicking Download: Google
limits archive downloads, and an uncertain capture must be reconciled first.

Use this project as a reference for your own periodic Takeout automation. Other
accounts, browsers and password managers may need a different reauth solution.
Sorry, this particular unattended workflow probably needs AI-agent assistance
today; manual sign-in and manual transfer initiation remain supported.

## Completion and verification

Staged bytes are progress, not a completed backup. A service job is complete only
after its block list commits and Azure HEAD matches the saved source length and
opaque `gtr_job` marker. On completion the service clears that job's source URL and
authorization. This is byte-count/ownership verification, not a source checksum.

For a complete export, reconcile every unique manifest filename and exact byte
count with committed Azure objects. Previously verified backups must still match
their recorded sizes; do not count retries, uncommitted block lists or a UI
download-start message as additional completed archives. The runner's completion
journal is useful evidence, but it does not replace a final independent inventory.
Preserve Google's omission report separately and distinguish Google-side missing
data from transfer failures. Never copy private receipts, credentials or export
manifests into the public repository.

## Validation

`pnpm --dir apps/extension test -- --runInBand --watchman=false` covers restart
checkpoints, lost stage/commit responses, out-of-order completion, waiting for
outstanding work after failure, conditional commits, source HTML/auth rejection,
timeouts, concurrency reservations, duplicate interception, uncertain Google
navigation, and preservation of legacy reservations. Local mock end-to-end tests
check that copied bytes and committed archive contents agree.

The November run verified all 216 available data parts and the separate omission
report in Azure using the local service and agent-operated reauthentication.
That live result does not establish automatic recovery for every browser worker,
unattended manager unlock, credential renewal, reboot recovery or future exports.
