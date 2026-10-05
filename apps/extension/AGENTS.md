# GTR Extension Agent Guide

This repo is the Chromium browser extension for Gargantuan Takeout Rocket. It intercepts browser downloads, captures the final Google Takeout URL and cookies, then asks Azure Blob Storage to copy the data through a GTR proxy.

Treat this as security-sensitive extension code. It handles Google cookies, Azure SAS URLs, broad host permissions, and download interception. Prefer small, reviewable changes and avoid expanding permissions or logging sensitive data unless the user explicitly asks for it.

## Project Shape

- `src/background.ts`: extension service worker. Reads config from `chrome.storage.local`, intercepts downloads, cancels native downloads, encodes cookies, starts transloads, and writes download status.
- `src/transload.ts`: plans chunked transfers and coordinates block staging/commit.
- `src/jeContainerClient.ts`: "just enough" Azure Blob client used by the transload flow.
- `src/azb.ts`: Azure Blob SAS URL to proxy URL conversion.
- `src/Popup/App.tsx`: popup UI and local extension settings.
- `src/Popup/ArchiveHistory.tsx`: export groups, archive progress, recovery guidance, and byte details.
- `src/Popup/model.ts` and `src/config.ts`: presentation helpers and shared credential validation.
- `src/Popup/App.css`: popup and full-tab styles, bundled to `public/build/popup.css`.
- `public/manifest.json`: MV3 extension manifest. Changes here affect Chrome permissions and review/security posture.
- `public/build/`: generated bundle output from esbuild. It is ignored; do not edit it by hand.
- `test/`: Jest tests. Some tests are live integration tests that require network and Azure credentials.
- `pnpm preview:popup`: local UI preview with fake Chrome APIs; see `test/fixtures/popup-chrome.js` for its states. No live credentials or downloads are used.
- `test/cf-origin`: Cloudflare Worker fixture origin for local and deployed E2E test sources.

## Common Commands

```bash
npm install
npm run build
npm run fmt:check
npm run fmt
npm test -- --runInBand
npm run test:integration
npm run test-origin:test
npm run test-origin:typecheck
npm run test-origin:deploy -- --dry-run
npm run typecheck
npx tsc --noEmit
```

`npm run build` bundles `src/background.ts` and `src/popup.tsx` into `public/build`.

`npm test -- --runInBand` is for local unit tests and should not require Azure credentials or live network transfers. `npm run test:integration` runs live transload tests under `test/integration`; those tests require network access and `AZURE_STORAGE_CONNECTION_STRING` for the Azure cases.

`npm run test-origin:*` commands operate the in-repo Cloudflare Worker fixture origin. That subproject uses pnpm internally and has its own `pnpm-lock.yaml`. The intended deployed hostname is `https://gtr-cf-test-origin.677472.xyz`.

## Safety Rules

- Do not commit `.env`, SAS URLs, Google cookies, generated zip packages, or local editor files.
- Be careful with `console.log` in `background.ts`, `transload.ts`, and `jeContainerClient.ts`; URLs can contain credentials or cookie-bearing query parameters.
- Do not broaden `host_permissions` or extension `permissions` without calling it out clearly.
- Keep the public proxy default aligned with the README unless intentionally changing the service.
- Keep cookie handling compatible with the proxy contract: gzip the cookie header string, base64 encode it, and pass it as the `a` query parameter.
- Avoid changing transfer chunk sizes or concurrency casually. These are tied to Azure, browser, and proxy behavior.

## Current Known Rough Edges

- The filename listener releases skipped downloads and returns `true` synchronously; keep the callback-once regression tests when changing interception.
- Download interception now has a conservative URL allowlist, but the exact Takeout host/path set should be revisited when real-world failures appear.
- There is no lint script yet.
- The popup saves settings explicitly, masks the SAS URL, and validates expiry before enabling interception. Active jobs are confirmed through a worker message; historical pending records are shown as unconfirmed without rewriting them.
- Expired-but-enabled configuration is shown as blocked because the download listener leaves invalidly configured downloads on the device. Keep that UI state aligned with the listener. Grouped history is local history, not an inventory of every part Google exported.
- Progress counts successfully staged blocks. A blob is complete only after its block list commits. Serialized storage updates preserve parallel archive state, and late block responses must not overwrite a failed job.
- The Cloudflare test origin is available as a generated-byte fixture, but `gtr-proxy` may need its allowlist updated before full proxy-through-Azure E2E tests can use it.

## When Improving The Repo

Continue separating pure logic from Chrome and network boundaries. Useful next moves are:

- make URL planning, cookie encoding, and Azure proxy path generation easy to test without Chrome
- mock `fetch` for job-plan unit tests instead of using live network calls
- verify service-worker lifetime during long transfers without DevTools open
- keep the parallel-storage and late-block regression tests when changing status updates
- add focused tests for failure modes before touching the service-worker flow

For user-facing behavior, remember this tool is assistive rather than fully automated. The user still clicks through Google Takeout; the extension should be predictable, reversible, and obvious about when interception is enabled.
