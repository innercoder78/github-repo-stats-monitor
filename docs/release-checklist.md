# Release Checklist

Use this checklist before publishing a GitHub Release for GitHub Repo Stats Monitor 2.1.

## Extension loading

- [ ] Load the extension from a fresh clone with Chrome's "Load unpacked."
- [ ] Confirm the icon files load correctly.
- [ ] Reload the unpacked extension in Chrome.
- [ ] Confirm Quick Summary opens from the Chrome toolbar icon.

## Quick Summary

- [ ] Confirm the Quick Summary displays saved totals for Views, Stars, Forks, and Clones.
- [ ] Confirm the Quick Summary count says `Repositories monitored`.
- [ ] Confirm Quick Summary reads saved values when opened.
- [ ] Confirm Quick Summary Refresh updates saved repository stats when clicked.
- [ ] Confirm Quick Summary Refresh shows progress while saved repositories refresh.
- [ ] Confirm Quick Summary does not imply real-time updates, notifications, automatic checking, or background polling.
- [ ] Confirm token saved / missing-token status is accurate.
- [ ] Confirm Dashboard opens from Quick Summary.
- [ ] Confirm Settings opens from Quick Summary.
- [ ] Confirm Quick Summary `Close` closes the toolbar popup.
- [ ] Confirm the Close button is small, neutral gray, bottom-right aligned, and closes the popup.

## Dashboard

- [ ] Confirm Dashboard data updates only when the user refreshes.
- [ ] Confirm Dashboard `Refresh Now` works as a full manual refresh.
- [ ] Confirm full Dashboard refresh shows progress as repositories complete.
- [ ] Confirm Dashboard repository cards include a per-repository `Refresh` button.
- [ ] Confirm a per-repository refresh updates only that repository.
- [ ] Confirm full refresh and per-repository refresh cannot run at the same time.
- [ ] Confirm Dashboard `Settings` replaces the current tab with Settings.
- [ ] Confirm `Open Quick Summary` works from Dashboard.
- [ ] Confirm repo name links open GitHub in a new tab.
- [ ] Confirm Views, Stars, Forks, Clones, and Referring Sites display correctly where available.
- [ ] Confirm Views, Clones, and Referring Sites are described as GitHub traffic data limited to the recent traffic period GitHub exposes.
- [ ] Confirm native SVG line charts render correctly for Views and Clones.
- [ ] Confirm the Dashboard does not list Real watchers as a main metric.
- [ ] Confirm the Dashboard does not list Unique visitors as a main metric.
- [ ] Confirm matching fetched timestamps collapse into one `Data from ...` line.
- [ ] Confirm different or missing timestamps keep the detailed fetched timestamp display.
- [ ] Confirm last saved values are shown where available after partial refresh failures.

## Settings and token setup

- [ ] Confirm a GitHub token is required before repositories can be added, saved, or monitored.
- [ ] Confirm `+ Add repository` is disabled until token text is entered.
- [ ] Confirm saving repositories without a token is blocked.
- [ ] Confirm Settings can save repositories as `owner/repo`.
- [ ] Confirm Settings can save repositories as `https://github.com/owner/repo`.
- [ ] Confirm duplicate repository detection works across both formats.
- [ ] Confirm the 20-repository limit is enforced for manual and imported repositories.
- [ ] Confirm repo order can be changed with Move Up / Move Down.
- [ ] Confirm repo order is preserved after saving and reopening.
- [ ] Confirm Settings order controls Dashboard order.
- [ ] Confirm Import from GitHub lists repositories that the token can access.
- [ ] Confirm imported repositories are selected first, then added to Settings.
- [ ] Confirm imported repositories are not saved until `Save Settings` is clicked.
- [ ] Confirm Light Mode and Dark Mode can be selected and saved.
- [ ] Confirm Test connection checks metadata, traffic views, traffic clones, and referrers.
- [ ] Confirm Settings `Open Dashboard` replaces the current tab with Dashboard.
- [ ] Confirm `Open Quick Summary` works from Settings.
- [ ] Confirm token instructions mention fine-grained tokens and `Administration: Read-only` for traffic, clones, and referrers.
- [ ] Confirm a token limited to selected repositories can only import and monitor those repositories.
- [ ] Confirm the token is stored locally in Chrome extension storage.
- [ ] Confirm the token is not logged, displayed outside the password field, or sent anywhere except GitHub API requests made by the extension.
- [ ] Confirm Reset clears local Chrome extension storage for this extension.
- [ ] Confirm Reset removes the saved token, configured repositories, appearance setting, and saved stats.
- [ ] Confirm Reset does not revoke a GitHub token on GitHub and does not uninstall the extension.

## Data accuracy

- [ ] Confirm repository metadata matches GitHub for each configured repository.
- [ ] Confirm traffic views and clones match the recent traffic period GitHub exposes.
- [ ] Confirm referrers match the recent traffic period GitHub exposes.
- [ ] Confirm traffic views, clones, and referrers require repository access and `Administration: Read-only` permission for fine-grained tokens.
- [ ] Confirm totals match the configured repository list and latest saved data after refresh.
- [ ] Confirm saved data remains local to Chrome extension storage.

## Documentation

- [ ] Confirm README installation instructions are accurate.
- [ ] Confirm README feature list matches the current 2.1 extension behavior.
- [ ] Confirm README mentions Import from GitHub.
- [ ] Confirm README mentions manual repository add.
- [ ] Confirm README says a token is required before repositories can be added, saved, or monitored.
- [ ] Confirm README mentions the 20-repository limit.
- [ ] Confirm README says Settings order controls Dashboard order.
- [ ] Confirm README mentions full refresh progress.
- [ ] Confirm README mentions popup refresh progress.
- [ ] Confirm README mentions per-repository Dashboard refresh.
- [ ] Confirm README accurately explains last saved values after partial refresh failures.
- [ ] Confirm README accurately explains Reset clearing local Chrome extension storage.
- [ ] Confirm README says updates happen when refreshed, not in real time.
- [ ] Confirm README does not imply notifications, automatic background updates, Chrome Web Store publication, cloud sync, or external services.
- [ ] Confirm README lists Views, Stars, Forks, Clones, and Referring Sites where available.
- [ ] Confirm README mentions Light Mode and Dark Mode.
- [ ] Confirm manifest version is `2.1.0`.
- [ ] Confirm release notes match the current release when they are written outside this PR.
- [ ] Confirm this release checklist is still accurate.
