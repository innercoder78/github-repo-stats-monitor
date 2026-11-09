# Stats Screenshot, Phase 1: PNG Renderer

Developer-only infrastructure; Quick Summary integration is **not included**. Nothing imports the renderer from production UI or the service worker. No permissions, repository limits, storage, refresh logic, notifications, or appearance settings change.

## Preview

From the repository root, using an installed Node.js runtime:

```sh
node test/preview/server.mjs
```

Open `http://127.0.0.1:8765/test/preview/summary-image.html` in Chrome. Select each fictional fixture. The page encodes a PNG, displays the decoded image, and provides a development-only save link. The server binds to loopback and serves only five allowlisted preview/module files. Stop with Ctrl+C. No installation, build, extension loading, GitHub account, or token is needed. Do not open the HTML through `file://`, since ES module loading is restricted there.

Compare the resulting 1200 × 1600 image with the approved mockup, paying attention to card alignment, icon centering, blue borders, fitted text, freshness, warnings, waves, and footer. The fictional 48-repository fixture is deliberately reference-like; it does not change the extension's 20-repository limit. Generated PNGs are not committed or uploaded.

## API and input contract

`src/shared/summary-image.js` exports:

- `renderSummaryImage(data, { document } = {})`: asynchronously returns a new detached 1200 × 1600 canvas. Defaults to the current browser document, waits for local fonts, and rejects if a document or 2D context is unavailable.
- `encodeSummaryImagePng(canvas, timeoutMs = 15000)`: returns a Promise of a nonempty `image/png` Blob; rejects null/wrong-type output, thrown errors, invalid dimensions, or an encoder timeout.
- `renderSummaryImagePng(data, options)`: combines rendering and encoding, returning the Blob. The caller owns subsequent Blob URL creation/revocation. It does not initiate a download.
- `SUMMARY_IMAGE_WIDTH` and `SUMMARY_IMAGE_HEIGHT`.

Supply all required fields:

| Field | Meaning |
| --- | --- |
| `username` | Printable string, empty when unavailable; maximum 256 characters. Pass the account login without `@`. |
| `followers` | Account followers: nonnegative safe integer or `null`. |
| `stars`, `forks`, `watchers` | Sums over repositories with valid metadata: nonnegative safe integers or `null`. Watchers means saved `subscribers`, not stars. |
| `configuredRepositories` | Nonnegative safe integer: configured list length. |
| `validRepositories` | Number contributing complete valid metadata; between zero and configured count. |
| `dataAsOf` | Parseable timestamp string when any metric contributes; otherwise `null`. Use an ISO string with timezone to avoid ambiguous local parsing. |
| `displayPreferences` | Optional existing `{ dateFormat, timeFormat }` preferences, normalized by the shared display helper. |

All repository totals must be null when coverage is zero and non-null when coverage is positive. A real zero is displayed as zero, unavailable values as an em dash. No sample values are production defaults. Safe-integer overflow is rejected rather than rounded silently. Text is drawn through Canvas, never inserted into HTML. Local Arial/sans-serif font metrics determine fitting; unusually long content shrinks, with horizontal condensation as a final bound. Numbers use the environment's thousands separators; dates use the existing local-time preference formatter.

`src/shared/summary-image-data.js` exports `validateSummaryImageData(data)` and `prepareSummaryImageData({ repositories, latestStats = {}, accountStats = null, displayPreferences })`. The preparation helper takes snapshots only; it never obtains them from storage. `repositories` must be an array of unique nonempty canonical repository names, as supplied by existing settings. `latestStats` is the existing repository-keyed metadata map. Metadata contributes only when `stars`, `forks`, `subscribers` are nonnegative safe integers and `fetchedAt` is valid. Account followers contribute only with a nonempty login, valid follower count, and valid `fetchedAt`.

Freshness is the oldest successful timestamp among exactly those contributors. Unconfigured entries and views/clones/referrers timestamps are excluded. Invalid/missing metadata reduces coverage. No configured repositories means no contributing repository values, not fabricated zeros. Missing account data is indicated separately. Complete repository coverage produces no coverage warning. Retained valid saved metadata remains usable even after a later request error; the timestamp describes the saved values.

Callers providing the renderer's contract directly are responsible for truthful aggregates and conservative freshness; use the pure preparation helper for existing saved snapshots. The component requires a browser document with Canvas 2D, Path2D, roundRect, and toBlob. It is not a service-worker renderer.

## Initial verification and known limitations

Base: `43b463839be16af9838459182e581d5fc9303879`. Live main matched and there were no open PRs during preflight. Existing local worktree was clean.

On 2026-11-08, Node v24.22.1:

- `node --test test/summary-image.test.mjs`: passed (data, zeros, missing/partial coverage, timestamps, invalid values, overflow, long content, dimensions, rendering and encoding failures).
- `node --test test/*.test.mjs`: 15 passed, 1 failed. The existing Dashboard test at line 107 assumes UTC and English 12-hour formatting. Local defaults are `pt-BR` and `America/Fortaleza`: it receives `11:45` rather than `2:45 PM`.
- Setting only process `TZ=UTC` produces `14:45`, so timezone alone does not resolve the failure. `LANG=en_US.UTF-8` did not change this Windows Node runtime's default locale.
- A process-only diagnostic with `TZ=UTC` and a temporary `Intl.DateTimeFormat` wrapper defaulting unspecified locales to `en-US` passed the unchanged Dashboard test. This confirms both timezone and locale dependence; it is not counted as a normal suite pass. No existing test or production formatter was changed.

The actual PNG was rendered and visually inspected in Codex's Chromium-based in-app browser (user agent `Chrome/157.0.0.0`, Windows). Opened the preview, selected reference-like, partial, long, empty, and zero fixtures, and inspected cards plus the scrolled footer. All five encoded successfully; no text overlap or unexpected clipping was observed. The decoded image's natural dimensions were verified as 1200 × 1600. Saved the final reference-like fictional PNG locally (1,568,557 bytes). Reloading against the documented allowlisted server also succeeded. Standalone Google Chrome was not available through the connected browser inventory, so standalone Chrome verification remains outstanding. Tests with mocked Canvas establish contracts only, not visual fidelity.

The design preserves the reference hierarchy, icon order, blue outlined cards and dividers, dark palette, waves, and footer. The taller 3:4 composition adds vertical spacing without stretching the reference. Differences include local Arial typography, hand-defined statistic icons, simpler glow/wave geometry, locale-dependent separators/date text, fictional username, and the required “Data as of” label. Large values and long usernames reduce font size. Pixel-identical reproduction, other operating-system font rendering, and all possible locale scripts are not guaranteed. Production integration and real account export are intentionally untested and reserved for Phase 2.

## Final card and wave refinement verification — 2026-11-08

The refinement changes only `card()` and `waves()` in the renderer, plus these notes. Card centers are now nearly black with subtle vertical gradients, shallow elliptical rim lighting, and softly tapered edge highlights. Reduced outer bloom avoids a uniform blue panel effect. Card geometry, text, icons, logo, and layout are unchanged.

Two overlapping cubic-curve ribbons replace the previous wave polygons. Their closures are beyond the left/right canvas edges and only the continuous curves are stroked. The ambient radial fade covers the canvas instead of starting at a hard horizontal boundary, removing the visible cutoff. Gradient depth and restrained edge glow preserve separation from freshness/coverage text and the footer.

Rendered all five existing fictional fixtures in the Windows Chromium in-app browser (user agent `Chrome/157.0.0.0`), saved their actual PNGs, and inspected them at original resolution against the approved conversation mockup. All five decode to 1200 × 1600. Normal, zero, missing, partial, and long-content exports remain legible with no observed clipping or unintended overlap. The normal export is 1,120,195 bytes; SHA-256 `b2825d57138008401165dbbc0f65d9bed780d64f36f10f7bfbc9a92e01e64a3b`. The local review artifact is named `PR135-refined-normal.png`; generated images are not committed.

Fresh tests on Node v24.22.1: `node --test test/summary-image.test.mjs` passed; `node --test test/*.test.mjs` reported 15 passed and the same one pre-existing Dashboard locale/timezone failure (`11:45` versus hard-coded `2:45 PM`). No tests or unrelated application code were changed. Standalone Google Chrome, other browser/OS/font combinations, and production integration remain unverified. Pixel-identical fidelity is not claimed; the approved 3:4 adaptation and local-font limitations still apply.
