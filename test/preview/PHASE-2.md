# Stats Screenshot Phase 2 integration verification

Base commit: `5dfb25ae50069d84f380ead335ba0f4cbb9e1f5d` (merged PR #135).

## Implementation

The popup binds `src/popup/stats-screenshot.js` independently of its existing rendering, refresh and activity paths. The native button precedes Close in the existing flex row, with Stats Screenshot at the far left and Close at the far right (`space-between`); its live status is separate from manual-refresh status. It performs no network requests, runtime messages, storage writes, activity claims/acknowledgments or badge changes. There is no checkbox or new setting.

A single local storage read obtains raw settings, account statistics and repository metadata. Using raw values avoids the general UI normalizers substituting zero for missing values. The unchanged Phase 1 preparation helper and PNG renderer handle aggregates, coverage and conservative freshness. At least one contributing metric and one configured repository are required. Account-only and repository-only data retain the existing unavailable/coverage indicators. Old saved data is allowed; its timestamp stays old.

After asynchronous rendering/encoding, a second read and a storage-change revision check reject concurrent mutations, including token round trips while the popup is open. Changes to activity alone do not invalidate export. Token changes observed while the popup is open require reopening it. No snapshot, token or raw error is logged or placed in the DOM.

### Account-context race protection

Inspection found that Settings token saves precede the background's asynchronous account reset. An old in-flight response may also save account data later. The small supporting storage change addresses these cases for export without changing the existing refresh/activity result contracts:

- A token change through `saveSettings()` atomically stores `summaryImageAccountContext: null` alongside the settings. Saving unchanged credentials preserves the context.
- `saveAccountStats()` stores export provenance with the account values: SHA-256 of the request's token, login and fetchedAt. Both full refresh and the background follower fallback pass the actual request token. The token itself is not duplicated in storage.
- Screenshot generation checks that provenance against the current snapshot. Invalid provenance with populated account data prevents export and asks the user to Refresh. A hashing failure leaves provenance invalid but does not prevent existing statistics from being saved.
- Legacy account data without the key is omitted from exports until refreshed. Its historical token association cannot be reconstructed offline, and verified repository metadata must not lend credibility to an unverified account identity.
- Successful repository metadata reads now store `summaryImageTokenHash` within that metadata entry, atomically with its values and fetchedAt through the existing cache save. Failed metadata requests preserve the previous fingerprint along with the saved values; successful traffic requests do not replace it. Screenshot preparation filters out legacy/other-token entries before aggregation. The storage normalizer preserves the optional fingerprint; regular UI, cache fallback and activity logic remain unchanged. A hashing failure marks the new metadata unverified without failing the normal refresh.
- Reset already clears the marker with all local storage. No new setting, import/export option, repository limit, permission or version change is introduced.

### Download lifecycle

The controller attaches a temporary hidden download anchor to a Blob URL and clicks it, then removes the anchor. Filename: `repository-summary.png`. The UI says only “Download requested. Check Chrome Downloads.” Synchronous request failures release the URL and recover the button. Successful requests retain URLs for 60 seconds in an open document; pagehide clears timers and leaves URL cleanup to document destruction rather than immediately revoking a possibly in-use download URL. This grace period is not an acceptance/completion acknowledgment. Popup closure may interrupt work. No additional tab, window, offscreen document or background export job is created.

## Initial automated verification — 2026-11-09 (before follow-up)

Node.js v24.22.1 on Windows, local timezone America/Fortaleza.

- `node --test test/stats-screenshot.test.mjs test/summary-image.test.mjs test/popup-production-path.test.mjs test/activity-production-paths.test.mjs`: passed, 4 test files.
- `node --test test/*.test.mjs`: 16 passed, 1 failed, 17 test files. **The complete suite does not pass in this environment.**
- The failure is the unchanged Dashboard assertion at `test/dashboard-regression.test.mjs:107`: expected `Data as of: 08/08/2026 2:45 PM`, actual `Data as of: 08/08/2026 11:45`. It assumes UTC and an English 12-hour locale. The same failure was recorded for the Phase 1 baseline. No existing assertion was weakened.
- A separate process-only diagnostic setting `TZ=UTC` and defaulting unspecified `Intl.DateTimeFormat` locales to `en-US` passed the unchanged Dashboard test. This isolates the environment dependence; it is not counted as a normal full-suite pass.

The new tests execute the real export controller, preparation helper and renderer with simulated DOM, Canvas encoding and Chrome APIs. They cover current saved values; no refresh or network access; complete, partial, account-only, missing and zero data; conservative timestamps; dimensions and encoder failures; duplicate events; storage/render/URL/click failures and recovery; URL grace-period cleanup; pagehide; concurrent mutations; token changes; provenance and atomic invalidation; button placement and labels; absence of the removed checkbox; and unchanged manifest permissions/version. The popup production-path test additionally checks no refresh on open, existing Refresh and Close, unchanged cards/refresh status, and no activity messages or storage changes during export. Canvas mocks do not prove real encoding or browser downloads.

## Browser preview

Run `node test/preview/popup-server.mjs`, then open:

- `http://127.0.0.1:8766/src/popup/popup.html?appearance=light`
- `http://127.0.0.1:8766/src/popup/popup.html?appearance=dark`

This loopback server serves only popup/shared source assets and the fictional Chrome API fixture. It does not load an extension or make GitHub requests; CSP blocks connections. Navigation APIs in the fixture are inert. Restart the server if adding a new shared source file, because its allowlist is constructed at startup.

Initial observations before the follow-up, in Codex's Chromium-based in-app browser on Windows, user agent `Chrome/157.0.0.0`:

- Light and Dark Mode: Stats Screenshot immediately left of Close; equal button top coordinates and heights; 8px gap. The 340px popup shell had clientWidth = scrollWidth = 340, with no horizontal overflow.
- Tab/Shift+Tab moved between the native bottom buttons; keyboard Enter requested export in Dark Mode. Focus was visible. Existing statistic cards remained in place.
- Light Mode click visibly showed the disabled screenshot button and “Generating PNG… Keep Quick Summary open.” It recovered with the exact download-request status. Dark Mode keyboard export also recovered with that status.
- A real fictional PNG was downloaded locally: 1,100,467 bytes; PNG header dimensions 1200 × 1600. Visual inspection confirmed readable username, 42 followers, 120 stars, 30 forks, 12 watchers, 2 repositories, conservative 2026/11/07 freshness and the unchanged approved graphic. No generated image was committed or uploaded.
- Final preview console inspection showed no warnings/errors. A preview reload temporarily failed after adding a shared module to the running server's static allowlist; restarting the server resolved it before the final checks.

Installed Google Chrome reports version 157.0.8103.39, but the connected computer-use inventory exposes only the in-app browser and MCP Apps, not Chrome or native controls. **Real Google Chrome unpacked-extension toolbar-popup testing remains unverified.** In particular, actual extension storage events, native popup focus-loss interruption, Chrome download prompts/destination/cancellation, navigation/Close in the real extension, and real simultaneous manual/background refresh races have not been exercised interactively. Automated simulations and a localhost preview are not production-popup proof. Later download acceptance/completion is intentionally unobservable by the product.

## Review scope

The approved renderer and its data helper remain unchanged. New DOM output uses textContent and a fixed filename. Tokens and provenance are never passed to Canvas or download links; configured repository identifiers are consumed only for aggregation. No screenshots are automatically uploaded. Supporting account-save changes only supply export provenance; existing activity, notification, refresh coordination, request limits, ordering, themes and navigation are intentionally preserved. This is unreleased development work, not a release preparation.

## PR #136 follow-up — opposite-end buttons and cross-account safety

Preflight main remained `5dfb25ae50069d84f380ead335ba0f4cbb9e1f5d`; the only open PR was #136 at `2e66c96bd3a8c2b14786755678d52b739a6bbf69`. Local branch matched, with one clean worktree and no stashes. Reviews, comments, review threads, commit statuses, check runs and workflow runs were empty (there were consequently no workflow jobs to inspect). No unrelated work was present.

### Reproduction and correction

Before changing production code, a Node reproduction executed the actual `refreshStatsCache`, storage saves and screenshot controller/renderer with fictional fetch/storage/Canvas APIs:

1. Token A fetched `fictional/private-repo` with 321 stars, 12 forks and 7 subscribers.
2. Settings saved token B and the account-reset save cleared account values; repository metadata remained intact.
3. B's account request succeeded with `fictional-b` and 22 followers, while repository metadata returned HTTP 404. The old 321 stars and original metadata timestamp remained saved.
4. Clicking the screenshot controller generated labels containing `@fictional-b`, `22` followers and `321` stars, and dispatched one simulated download request, with zero export-time fetches.

This **confirmed reproduction in production JavaScript with simulated APIs** is not a live GitHub account or real Chrome extension reproduction. The root cause was that only account followers had provenance; repository fallback values were passed directly to the renderer helper regardless of their originating token.

The correction extends the existing export-only provenance to successful metadata entries, then filters at export time. It neither deletes nor rewrites old cached numbers to make export possible. Normal Quick Summary and Dashboard still show their saved fallback. A late A response remains tagged A even if it arrives after B's successful refresh and therefore cannot contribute to B's image. Same-token failed metadata refreshes remain exportable offline. Current-token metadata with zeros remains valid. Excluded entries reduce coverage and do not contribute timestamps; independently verified account data can still produce an account-only image.

Legacy account/metadata values with unknown provenance are now omitted rather than assumed trustworthy. If no verified metrics remain, export asks the user to Refresh. The same saved token is needed for offline fingerprint comparison; token rotation (even for the same account) requires successful re-verification. Existing recent-refresh reuse is unchanged, so a reused legacy entry may remain unverified until the next actual metadata fetch. Direct external storage edits or deliberately forged fingerprints are outside this local provenance check's trust boundary. No token or hash is rendered in the PNG.

### Follow-up validation — 2026-11-09

Node.js v24.22.1, Windows, America/Fortaleza:

- Targeted command: `node --test test/screenshot-account-transition.test.mjs test/stats-screenshot.test.mjs test/summary-image.test.mjs test/popup-production-path.test.mjs test/account-refresh.test.mjs test/background-account.test.mjs test/activity-production-paths.test.mjs test/refresh-coordination.test.mjs`: **8 passed, 0 failed**.
- Complete command: `node --test test/*.test.mjs`: **17 passed, 1 failed, 18 test files**. The unchanged Dashboard locale/timezone assertion remains the sole failure; normal output is `11:45`, expected `2:45 PM`. No assertion was weakened or formatter changed. The full suite is not reported as passing.
- The new account-transition test runs actual refresh, cache and export paths with simulated APIs, covering A-to-B/404, unchanged-account fallback, offline export, successful new-token full/per-repository metadata, zero/partial/account-only data, legacy data, concurrent changes, late A responses, preserved timestamps, and unchanged activity/baseline storage during export. Existing controller tests retain duplicate/failure/cleanup coverage. Popup integration tests still forbid activity DOM clearing, messages and badge updates during export.

Actual follow-up browser checks used the same in-app Chromium (`Chrome/157.0.0.0`) and local fictional fixture:

- Light and Dark Mode geometry: Stats Screenshot left x=11.99px, matching both full-width buttons; Close right x=327.99px, unchanged from the earlier preview. Both bottom buttons top y=629.42px and height=28.18px. Widths stayed label-sized (126.49px and 66.00px), with 123.51px of visible space between. Shell clientWidth=scrollWidth=340px; no clipping/wrapping or horizontal growth observed. The only production CSS change is flex-end to space-between.
- Tab moved from Stats Screenshot to Close; Shift+Tab returned with a visible focus outline. DOM order is unchanged.
- With `?appearance=dark&scenario=mixed`, the normal popup retained 321 cached stars. Keyboard Enter exported a real 1200 × 1600 PNG (1,100,927 bytes), visually inspected: `fictional-b`, 22 followers, 0 stars/forks/watchers from the verified second repository, 2 configured repositories, coverage 1 of 2, and 2026/11/08 freshness. The old-token 321-star repository and its older timestamp were absent from the image. Accurate download-request status appeared and shell width remained 340px.
- With `?appearance=light&scenario=legacy`, export displayed the unverified-data explanation and recovered the enabled button. Clicking Refresh exercised the fixture's intentionally rejected refresh request and existing failure feedback, without clearing screenshot feedback or cards. This does not test a real GitHub refresh.
- Close was clicked in the localhost preview but the tab remained open; this does not establish real extension Close behavior. Automated production-binding coverage still verifies `window.close()` is called.
- Native Google Chrome remains absent from connected browser/native controls. Real unpacked-extension popup lifecycle, real storage events/requests/account switching, download prompts and real navigation/Close remain **unverified**. The local browser fixtures establish layout/encoding/request behavior, not real Chrome popup integration.

Generated PNGs and UI captures remain local and are not published. Manifest, permissions/host permissions, dependencies, renderer/data-helper design and extension version are unchanged.
