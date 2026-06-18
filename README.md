# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for tracking GitHub repository statistics from one place.

This repository currently contains the initial Manifest V3 scaffold only. The extension is not fully functional yet: GitHub API integration, settings persistence, and live repository statistics will be added in later PRs.

## Load unpacked in Chrome

No build step is required. The extension can be loaded directly from this repository folder:

1. Open `chrome://extensions`
2. Enable Developer mode
3. Click “Load unpacked”
4. Select the repository folder

## Current status

The popup, dashboard, and options pages are static placeholders. They do not make GitHub API calls, store tokens, or save settings yet.
