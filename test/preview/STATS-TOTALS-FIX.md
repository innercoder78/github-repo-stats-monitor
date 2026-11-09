# Stats Screenshot repository totals correction

Baseline: `bb86e9e739c7809c6ebb7913a6cb0d84caa21bf2` (PR #136 merged).
Preflight on November 9, 2026 found matching live/local main, no open PRs,
no main statuses/check runs/workflow runs, and no PR #136 reviews/comments/threads.
The single local worktree was clean, with no ignored/untracked files or stashes.

## Reproduced cause

Production JavaScript with fictional HTTP, Chrome storage, DOM and Canvas APIs:
six legacy repository entries hold 4 stars, 2 forks and 0 watchers in total but
have no `summaryImageTokenHash`. Each has a recent coordinated repository
completion. The saved account has 3 followers.

Running the original baseline refresh and screenshot controller in a temporary
source copy reproduces the mismatch after manual Refresh: only `/user` is
requested; all six repository entries are reused without verification. The
renderer receives unavailable repository totals and draws the 0-of-6 coverage
warning. A simulated download is dispatched.

| Saved/exported metric | Original export after Refresh | Corrected export after admitted Refresh |
| --- | --- | --- |
| Followers | 3 | 3 |
| Stars | unavailable | 4 |
| Forks | unavailable | 2 |
| Watchers | unavailable | 0 |
| Repositories monitored | 6 | 6 |
| Eligible coverage | 0/6 | 6/6 |
| Refresh HTTP requests | 1 account | 1 account + 6 metadata |
| Export HTTP requests | 0 | 0 |

## Correction and boundaries

Inside the existing admitted manual refresh, recent repository entries are fully
reused only when their metadata fingerprint matches the request token. Otherwise
the existing metadata request path verifies ownership; recent traffic values and
timestamps are retained. No old metadata is simply relabeled. Failures preserve
saved metadata, its timestamp and its provenance, and invalidate that repository's
reusable completion through the existing failure handling.

Existing full-refresh admission, locks, one-minute completion reuse, request
limiting, concurrency, rate-limit handling and background quiet windows remain
unchanged. A recent full-refresh completion can still postpone verification:
wait at least one minute and use Refresh again. Screenshot feedback explicitly
counts cached repositories omitted for missing current-account verification and
explains this retry. Partial images retain the existing PNG coverage warning.

No changes to manifest/permissions, storage schema/normalizer, account filtering,
renderer/dimensions, layout, popup-open behavior, or dependencies. Export remains
local and leaves activity, baselines and cache unchanged.

## Validation

Windows, Node.js v24.22.1, America/Fortaleza:

- Targeted: `node --test test/account-refresh.test.mjs test/version-check.test.mjs test/screenshot-account-transition.test.mjs test/stats-screenshot.test.mjs test/summary-image.test.mjs test/popup-production-path.test.mjs test/background-account.test.mjs test/activity-production-paths.test.mjs test/refresh-coordination.test.mjs test/request-coordination.test.mjs` — 10 passed, 0 failed.
- Complete: `node --test test/*.test.mjs` — 17 passed, 1 failed (18 files).
- The unchanged Dashboard assertion at `test/dashboard-regression.test.mjs:107`
  expects `2:45 PM`; this environment formats `11:45`. No test was weakened or
  unrelated formatter changed.
- Existing reuse fixtures now explicitly contain verified metadata; their
  no-extra-request and activity assertions remain intact.
- Added upgrade assertions cover exact totals, zero watchers, request counts,
  matching ownership, same-token offline export, already-verified reuse,
  preserved traffic freshness, unchanged activity/viewed baselines, normal
  notification baseline synchronization, failed verification and partial coverage,
  full-refresh reuse, account switching with denied metadata, and recovery.
- Existing tests retain denied private access, same-token failed-refresh fallback,
  late old-account responses, concurrent account changes, request concurrency,
  quiet windows, retry/rate-limit behavior, storage races and UI contracts.
- `git diff --check` passes.

Evidence is simulated production-code rendering, not an actual Chrome PNG or
completed browser download. Connected controls expose only the in-app browser
and MCP Apps, not installed Chrome. Actual extension Refresh → Stats Screenshot,
popup lifecycle and browser download behavior remain unverified.

Residual limitations: failed requests or hashing failures cannot establish
verification; token rotation requires fresh verification; the existing completion
window is intentionally preserved. Normal saved-value fallback can therefore
still differ from eligible export totals, now with explicit verification feedback.
