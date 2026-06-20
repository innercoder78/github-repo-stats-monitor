# Release Checklist

Use this checklist before publishing a GitHub Release for GitHub Repo Stats Monitor 2.0.0.

## Extension loading

- [ ] Load the extension from a fresh clone with Chrome's "Load unpacked."
- [ ] Confirm the icon files load correctly.
- [ ] Reload the unpacked extension in Chrome.
- [ ] Confirm Quick Summary opens from the Chrome toolbar icon.

## Quick Summary

- [ ] Confirm the redesigned Quick Summary displays cached totals for Views, Stars, Forks, and Clones.
- [ ] Confirm the Quick Summary count says `Repositories monitored`.
- [ ] Confirm Quick Summary Refresh updates cached stats when clicked.
- [ ] Confirm Quick Summary does not imply real-time updates or background updates.
- [ ] Confirm token saved / missing-token status is accurate.
- [ ] Confirm Dashboard opens from Quick Summary.
- [ ] Confirm Settings opens from Quick Summary.
- [ ] Confirm Quick Summary `Close` closes the toolbar popup.
- [ ] Confirm the Close button is small, neutral gray, bottom-right aligned, and closes the popup.

## Dashboard

- [ ] Confirm the redesigned Dashboard refreshes when opened.
- [ ] Confirm Dashboard `Refresh Now` works.
- [ ] Confirm Dashboard `Settings` replaces the current tab with Settings.
- [ ] Confirm `Open Quick Summary` works from Dashboard.
- [ ] Confirm repo name links open GitHub in a new tab.
- [ ] Confirm Views, Stars, Forks, Clones, and Referring Sites display correctly.
- [ ] Confirm Views and Clones are described as GitHub traffic data from the last 14 days.
- [ ] Confirm Referring Sites are described as GitHub traffic data from the last 14 days.
- [ ] Confirm native SVG 14-day line charts render correctly for Views and Clones.
- [ ] Confirm the Dashboard does not list Real watchers as a main metric.
- [ ] Confirm the Dashboard does not list Unique visitors as a main metric.
- [ ] Confirm matching fetched timestamps collapse into one `Data from ...` line.
- [ ] Confirm different or missing timestamps keep the detailed fetched timestamp display.

## Settings and token setup

- [ ] Confirm Settings can save repositories as `owner/repo`.
- [ ] Confirm Settings can save repositories as `https://github.com/owner/repo`.
- [ ] Confirm duplicate repository detection works across both formats.
- [ ] Confirm repo order can be changed with Move Up / Move Down.
- [ ] Confirm repo order is preserved after saving and reopening.
- [ ] Confirm Light Mode and Dark Mode can be selected and saved.
- [ ] Confirm Test connection checks metadata, traffic views, traffic clones, and referrers.
- [ ] Confirm Settings `Open Dashboard` replaces the current tab with Dashboard.
- [ ] Confirm `Open Quick Summary` works from Settings.
- [ ] Confirm token instructions mention fine-grained tokens and `Administration: Read-only`.
- [ ] Confirm the token is not logged or displayed outside the password field.
- [ ] Confirm Reset clears the saved token, repositories, appearance preference, and cached stats.

## Data accuracy

- [ ] Confirm repository metadata matches GitHub for each configured repository.
- [ ] Confirm traffic views and clones match GitHub traffic data for the last 14 days.
- [ ] Confirm referrers match GitHub traffic data for the last 14 days.
- [ ] Confirm totals match the configured repository list and latest cached data after refresh.
- [ ] Confirm cached data remains local to Chrome extension storage.

## Documentation

- [ ] Confirm README installation instructions are accurate.
- [ ] Confirm README feature list matches the current 2.0.0 extension behavior.
- [ ] Confirm README says updates happen when refreshed, not in real time.
- [ ] Confirm README does not imply automatic background updates, Chrome Web Store publication, cloud sync, or external services.
- [ ] Confirm README lists Views, Stars, Forks, and Clones as the main metrics.
- [ ] Confirm README mentions Referring Sites and 14-day Views/Clones charts.
- [ ] Confirm README mentions Light Mode and Dark Mode.
- [ ] Confirm manifest version is `2.0.0`.
- [ ] Confirm release notes match the current release when they are written outside this PR.
- [ ] Confirm this release checklist is still accurate.
