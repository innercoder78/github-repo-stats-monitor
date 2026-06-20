# Release Checklist

Use this checklist before publishing a GitHub Release for GitHub Repo Stats Monitor.

## Extension loading

- [ ] Load the extension from a fresh clone with Chrome's "Load unpacked."
- [ ] Confirm the icon files load correctly.
- [ ] Reload the unpacked extension in Chrome.
- [ ] Confirm Quick Summary opens from the Chrome toolbar icon.

## Quick Summary

- [ ] Confirm cached totals display correctly.
- [ ] Confirm Manual Refresh updates cached stats.
- [ ] Confirm token saved / missing-token status is accurate.
- [ ] Confirm Dashboard opens from Quick Summary.
- [ ] Confirm Settings opens from Quick Summary.
- [ ] Confirm Quick Summary `Close` closes the toolbar popup.
- [ ] Confirm the Close button is small, neutral gray, bottom-right aligned, and closes the popup.

## Dashboard

- [ ] Confirm Dashboard auto-refresh works when opened.
- [ ] Confirm Dashboard `Refresh Now` works.
- [ ] Confirm Dashboard `Settings` replaces the current tab with Settings.
- [ ] Confirm `Open Quick Summary` works from Dashboard.
- [ ] Confirm repo name links open GitHub in a new tab.
- [ ] Confirm stars, forks, real watchers, views, unique visitors, and referrers display correctly.
- [ ] Confirm native SVG traffic charts render correctly.
- [ ] Confirm matching fetched timestamps collapse into one `Data from ...` line.
- [ ] Confirm different or missing timestamps keep the detailed fetched timestamp display.

## Settings and token setup

- [ ] Confirm Settings can save repositories as `owner/repo`.
- [ ] Confirm Settings can save repositories as `https://github.com/owner/repo`.
- [ ] Confirm duplicate repository detection works across both formats.
- [ ] Confirm repo order can be changed with Move Up / Move Down.
- [ ] Confirm repo order is preserved after saving and reopening.
- [ ] Confirm Test connection checks metadata, traffic views, and referrers.
- [ ] Confirm Settings `Open Dashboard` replaces the current tab with Dashboard.
- [ ] Confirm `Open Quick Summary` works from Settings.
- [ ] Confirm token instructions mention fine-grained tokens and `Administration: Read-only`.
- [ ] Confirm the token is not logged or displayed outside the password field.

## Data accuracy

- [ ] Confirm repository metadata matches GitHub for each configured repository.
- [ ] Confirm traffic views and unique visitors match GitHub traffic data.
- [ ] Confirm referrers match GitHub traffic data.
- [ ] Confirm totals match the configured repository list and latest cached data.

## Documentation

- [ ] Confirm README installation instructions are accurate.
- [ ] Confirm README feature list matches the current extension behavior.
- [ ] Confirm release notes match the current release.
- [ ] Confirm this release checklist is still accurate.
