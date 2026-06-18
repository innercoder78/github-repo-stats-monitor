# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository contains a Manifest V3 Chrome extension that can be loaded directly from the repository folder. Settings persistence is available now, while GitHub API fetching, live repository statistics, and charts will be added in later PRs.

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

The popup shows how many repositories are configured and whether a token is saved without displaying the token. The dashboard renders placeholder cards for the saved repositories.

## Current status

The extension does not make GitHub API calls yet and does not fetch live repository stats. GitHub API fetching will be added in a later PR.
