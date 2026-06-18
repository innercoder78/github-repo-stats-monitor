# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository contains a Manifest V3 Chrome extension that can be loaded directly from the repository folder. Settings persistence, repository metadata fetching, and GitHub traffic page view fetching are available now, while chart rendering is planned for a later PR.

## Load unpacked in Chrome

No build step is required. The extension can be loaded directly from this repository folder:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click “Load unpacked”
4. Select the repository folder

## Settings

Settings are stored locally with `chrome.storage.local` in Chrome extension storage. The options page lets you save a GitHub fine-grained personal access token and configure any repository list up to 20 repositories.

Repositories must use the `owner/repo` format, for example:

- `owner/repo`
- `innercoder78/github-repo-stats-monitor`

The popup shows how many repositories are configured and whether a token is saved without displaying the token. It also shows cached totals for stars, real watchers, forks, views from the last 14 days, and unique visitors from the last 14 days after the dashboard has fetched repository data.

Traffic API access requires the token to have access to the repository and Administration read permission for the selected repositories.

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
- Daily view records for future chart rendering

Traffic values are cached alongside repository metadata. If traffic fetching fails but metadata succeeds, cached metadata remains visible and the dashboard shows a traffic-specific error. If prior traffic data exists, it remains visible when a later traffic refresh fails.

## Current status

Repository metadata fetching and GitHub traffic page view fetching are implemented. Chart rendering is still planned for a later PR.
