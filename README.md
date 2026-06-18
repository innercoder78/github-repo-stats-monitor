# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository contains a Manifest V3 Chrome extension that can be loaded directly from the repository folder. Settings persistence and repository metadata fetching are available now, while traffic statistics and charts are planned for later PRs.

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

The popup shows how many repositories are configured and whether a token is saved without displaying the token. It also shows cached totals for stars, real watchers, and forks after the dashboard has fetched repository metadata.

## Repository metadata

The dashboard fetches repository metadata from the GitHub repository API for each configured repository when a token is saved. The “Refresh Now” button fetches the latest metadata again and stores the newest successful values in local extension storage so the popup and dashboard can show cached totals later.

Fetched metadata includes:

- Stars from `stargazers_count`
- Forks from `forks_count`
- Real watchers from `subscribers_count`

Real watchers intentionally use `subscribers_count`, not `watchers_count`, because GitHub's `watchers_count` often mirrors stars instead of actual repository subscribers.

## Current status

Repository metadata fetching is implemented. GitHub traffic stats, including views and unique visitors, are still placeholders and will be added in a later PR. Chart rendering is also planned for a later PR.
