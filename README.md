# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository contains a Manifest V3 Chrome extension that can be loaded directly from the repository folder. Settings persistence, repository metadata fetching, GitHub traffic page view fetching, and native SVG traffic trend charts are available now.

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

The popup shows how many repositories are configured and whether a token is saved without displaying the token. It also shows cached totals for stars, real watchers, forks, views from the last 14 days, and unique visitors from the last 14 days after the dashboard has fetched repository data. The popup remains cache-only and does not render charts.

Settings includes concise token setup guidance near the token field. Traffic API access requires the token to have access to the repository and Administration read permission for the selected repositories. Settings tests repository data and traffic data separately because stars, forks, and watcher metadata can load even when traffic access fails.

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

Traffic values and daily records are cached alongside repository metadata. Dashboard charts are based on GitHub's 14-day traffic API data, show up to 14 daily bars, and require no chart library, external assets, build step, or package tooling. If traffic fetching fails but metadata succeeds, cached metadata remains visible and the dashboard shows a traffic-specific error. If prior traffic data exists, it remains visible when a later traffic refresh fails.

## Current status

Repository metadata fetching, GitHub traffic page view fetching, and dependency-free native SVG chart rendering are implemented. The extension remains loadable directly with Chrome’s “Load unpacked.”
