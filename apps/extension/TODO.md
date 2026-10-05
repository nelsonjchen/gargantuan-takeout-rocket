# GTR Extension Improvement TODO

This is a working list for making the extension safer, easier to verify, and easier for future agents or humans to change.

## Next Product Priorities (October 2026)

- [ ] Remove the DevTools requirement for long transfers, with a live browser-lifetime test and recoverable state after worker termination. Popup polling alone is not sufficient evidence.
- [ ] Add a transfer queue with an explicit archive concurrency limit and per-archive recovery. Fresh Takeout authorization and Google's download limits must be respected; do not blindly retry whole exports.
- [ ] Add a destination check and committed-blob reconciliation: exact filename and bytes, available checksums, and an explicit distinction between copied and verified. Keep this read-only and avoid downloading large blobs to validate them.
- [x] Make expired-but-enabled configuration show Blocked instead of promising Azure transfer.
- [x] Group local history by export date, collapse older exports, and retain attention counts.
- [x] Explain failure recovery, single-block mini progress, finalization, and worker status failures. Expose exact byte sizes under transfer details.
- [x] Show unsaved settings, disable unchanged saves, and offer discard. Add a reusable local preview for loading, empty, active, failed, expired, and disconnected states.

## Immediate

- [x] Split local unit tests from live Azure/network integration tests.
  - Goal: `npm test` should pass without `AZURE_STORAGE_CONNECTION_STRING`.
  - Keep an explicit command for credentialed transload tests.
- [x] Add a TypeScript check script to `package.json`.
  - Suggested command: `npm run typecheck` -> `tsc --noEmit`.
- [x] Fix the popup `downloads` storage shape.
  - Use a plain object default instead of `new Map()`.
  - Remove the brittle tuple annotation around `useChromeStorageLocal`.
- [x] Reduce sensitive logging.
  - Avoid logging Azure SAS URLs, full Google Takeout URLs, and proxy URLs that include encoded cookies.
- [x] Validate required settings before enabling or acting on interception.
  - Do not cancel downloads when the Azure SAS URL is missing or malformed.

## Safety And Correctness

- [x] Filter intercepted downloads before cancellation.
  - Start with known Google Takeout host/path patterns.
  - Leave non-Takeout downloads alone even when interception is enabled.
- [ ] Make cookie encoding pure and separately testable.
  - Keep Chrome cookie retrieval at the boundary.
  - Unit-test cookie filtering, gzip/base64 encoding, and size/URL-limit behavior.
- [x] Tighten the `chrome.downloads.onDeterminingFilename` listener types.
  - Return `true` synchronously and call the typed filename callback exactly once.
  - Release skipped native downloads and cover settings failures with regression tests.
- [x] Handle missing `finalUrl` and other incomplete `DownloadItem` fields defensively.
- [x] Serialize parallel status writes and ignore late progress after a failed block.
  - Covered with delayed-storage parallel archive and late-block regression tests.

## Test Coverage

- [x] Mock `fetch` for `createJobPlan` unit tests instead of depending on a public 200 MB URL.
  - Cover mini archives, 50 GiB planning, partial chunks, authentication errors, and invalid lengths/chunk sizes.
- [x] Add an in-repo Cloudflare Worker test origin for deterministic fixture downloads.
  - Worker lives in `test/cf-origin`.
  - Intended deployment: `https://gtr-cf-test-origin.677472.xyz`.
- [ ] Deploy the Cloudflare Worker test origin once Wrangler auth is available.
  - This environment needs `CLOUDFLARE_API_TOKEN` for non-interactive deploys.
- [ ] Point integration tests at the Cloudflare test origin instead of the older public test URL.
- [ ] Update `gtr-proxy` test-server allowlist for `gtr-cf-test-origin.677472.xyz` before proxy-through-Azure E2E.
- [ ] Add unit tests for `azBlobSASUrlToProxyPathname`.
- [ ] Add tests for malformed Azure SAS URLs and missing container/blob pieces.
- [x] Add tests for URL filtering decisions before interception.
- [x] Add tests for settings validation and failure messages.

## Developer Experience

- [ ] Decide whether generated extension bundles should remain ignored or be produced in release automation only.
- [x] Add a short local development section to `README.md`.
- [ ] Add an explicit packaging/release checklist.
- [ ] Add local-only test and typecheck checks to CI after local verification stays stable.
- [ ] Consider adding ESLint or another lightweight lint pass after typecheck is stable.
- [ ] Remove or ignore local machine artifacts that are currently visible in the working tree.

## Larger Refactors

- [ ] Extract a small domain layer for:
  - settings validation
  - download eligibility
  - cookie-header creation
  - transload status updates
- [ ] Wrap Chrome APIs in small promise-based helpers with tests.
- [ ] Consider a queue/concurrency model for multiple simultaneous intercepted archives.
- [x] Improve popup UX around enabled state, credential validation, block progress, errors, and historical pending records.
  - Explicit settings save, masked SAS, expiry display, history filters, and a full-tab view.
  - Historical records remain intact; unconfirmed entries are checked against the running worker.
- [ ] Revisit extension permissions after URL filtering is in place.

## Notes

The extension handles cookies, signed Azure URLs, and broad browser permissions. Prefer changes that make behavior easier to prove locally before expanding behavior.
