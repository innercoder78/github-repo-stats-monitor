# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository contains a Manifest V3 Chrome extension that can be loaded directly from the repository folder. It saves settings locally, fetches repository metadata, fetches GitHub traffic page views and referring sites for the last 14 days, and renders native SVG traffic trend charts without external dependencies.

## Load unpacked in Chrome

No build step is required. The extension can be loaded directly from this repository folder:

Extension icon PNG files live in `assets/icons/` and are referenced by the Manifest V3 configuration.

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click “Load unpacked”
4. Select the repository folder

## Settings

Settings are stored locally with `chrome.storage.local` in Chrome extension storage. The options page lets you save a GitHub fine-grained personal access token and configure any repository list up to 20 repositories. It also includes a connection test that checks the token and the currently entered repository rows before you save settings.

Repositories can be entered as `owner/repo` or as a GitHub repository URL. Settings normalizes and stores values as `owner/repo`, for example:

- `owner/repo`
- `https://github.com/owner/repo`
- `innercoder78/github-repo-stats-monitor`

The popup shows how many repositories are configured and whether a token is saved without displaying the token. It also shows cached totals for stars, real watchers, forks, views from the last 14 days, and unique visitors from the last 14 days after repository data has been fetched. The popup remains cache-only on normal open, includes a manual Refresh button for updating cached stats, and does not render charts.

Settings includes concise token setup guidance near the token field. Create a GitHub fine-grained personal access token scoped to the repositories you want to monitor. Traffic and referrer API access requires the token to have access to the repository and the fine-grained token repository permission `Administration: Read-only` for the selected repositories. Settings tests repository data, traffic data, and referrers separately because stars, forks, and watcher metadata can load even when traffic or referrers access fails.

## Repository metadata

The dashboard fetches repository metadata from the GitHub repository API for each configured repository when a token is saved. The “Refresh Now” button fetches the latest metadata again and stores the newest successful values in local extension storage so the popup and dashboard can show cached totals later.

Fetched metadata includes:

- Stars from `stargazers_count`
- Forks from `forks_count`
- Real watchers from `subscribers_count`

Real watchers intentionally use `subscribers_count`, not `watchers_count`, because GitHub's `watchers_count` often mirrors stars instead of actual repository subscribers.

## Repository traffic

The dashboard also fetches traffic page views from GitHub's traffic API for each configured repository. GitHub traffic stats cover the last 14 days, and the extension displays:

- Views, last 14 days
- Unique visitors, last 14 days
- Native SVG bar charts for daily views and unique visitors
- Referring sites, last 14 days, when the saved token has access

Traffic values, daily records, and the latest GitHub-provided referrers list are cached alongside repository metadata. Dashboard charts are based on GitHub's 14-day traffic API data, show up to 14 daily bars, and require no chart library, external assets, build step, or package tooling. If traffic or referrers fetching fails but metadata succeeds, cached metadata remains visible and the dashboard shows a specific traffic or referrers error. If prior traffic or referrers data exists, it remains visible when a later refresh fails.

## Current status

Repository metadata fetching, GitHub traffic page view fetching, referring sites, and dependency-free native SVG chart rendering are implemented. The extension remains loadable directly with Chrome’s “Load unpacked.”
