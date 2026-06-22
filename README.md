# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for monitoring configured GitHub repositories from one local dashboard.

It is designed for manual review, not real-time monitoring. Dashboard data updates only when you manually refresh. GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes.

## Current Version

2.1

## What It Shows

Supported repository stats, where available:

* Views
* Stars
* Forks
* Clones
* Referring Sites / referrers

Additional dashboard details:

* Repository cards in the same order configured in Settings
* Views and Clones line charts based on GitHub traffic data
* Last refreshed information for saved data
* Last saved values where available when part of a refresh cannot complete

## Main Features

* Dashboard with summary totals, repository cards, traffic charts, and referring sites
* Quick Summary popup from the Chrome toolbar that reads saved values
* Settings page for your GitHub token, repositories, appearance, connection test, and reset
* Manual repository entry as `owner/repo` or a GitHub repository URL
* Import from GitHub for repositories the saved token can access
* Current maximum of 20 configured repositories
* Repository reordering in Settings; Settings order controls Dashboard order
* Light Mode and Dark Mode
* Manual full refresh from the dashboard with progress as repositories complete
* Manual refresh from the popup with progress while saved repositories refresh
* Per-repository Dashboard refresh buttons that update only one repository
* Repository links that open on GitHub
* Connection test for repo data, traffic views, traffic clones, and referrers
* Helpful error messages when part of a refresh fails
* Reset button that clears local Chrome extension storage for this extension
* Local storage only
* No build step
* No external libraries
* No analytics or telemetry
* No notifications, background polling, scheduled refresh, or automatic checking

## Installing

This extension is meant to be loaded manually in Chrome.

1. Download or clone this repository.
2. Open Chrome.
3. Go to `chrome://extensions`.
4. Turn on **Developer mode**.
5. Click **Load unpacked**.
6. Select the repository folder.

After that, the extension icon should appear in Chrome.

## Repository Configuration

Open **Settings** from the extension popup or dashboard.

A GitHub token is required before repositories can be added, saved, or monitored. The **+ Add repository** button is disabled until token text is entered, and saving repositories without a token is blocked.

Repositories can be added manually using either format:

```text
owner/repo
```

or:

```text
https://github.com/owner/repo
```

The extension saves them internally as `owner/repo`.

Repositories can also be imported from GitHub. **Import from GitHub** lists repositories that the token can access. Imported repositories are selected first, then added to the Settings repository list. They are not saved until **Save Settings** is clicked.

You can configure up to 20 repositories. The order of repositories in Settings determines the order shown on the Dashboard.

Use the **Appearance** setting to choose **Light Mode** or **Dark Mode**.

## GitHub Token

To use the extension, create a GitHub personal access token for the repositories you want to monitor. The token is used to import repositories and refresh repository stats.

A fine-grained token can be limited to selected repositories. A token limited to selected repositories can only import and monitor those repositories.

For traffic views, traffic clones, and referring sites, GitHub requires repository access and this fine-grained token permission for those repositories:

```text
Administration: Read-only
```

The token is stored locally in Chrome extension storage. It is not hard-coded into the extension, and it is not shown outside the password field. The token is used only for GitHub API requests made by the extension.

## How Refreshing Works

The extension updates data only when you refresh.

The Dashboard has a full **Refresh Now** action. A full Dashboard refresh shows progress as repositories complete. Dashboard repository cards also have a per-repository **Refresh** button. A per-repository refresh updates only that repository.

The Quick Summary popup reads saved values when opened. It can also refresh saved repository stats, and the popup shows progress while repositories refresh.

Full refresh and per-repository refresh do not run at the same time.

If some data cannot be refreshed, the extension shows last saved values where available.

GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes. Views, Clones, Referring Sites, and Views/Clones charts are limited by what GitHub returns for repository traffic.

The extension does not send notifications and does not update stats in the background automatically.

## Resetting Saved Data

The **Reset** button in Settings clears this extension's local Chrome storage. After Reset, the extension behaves like a fresh local install.

Reset removes the saved token, configured repositories, appearance setting, and saved stats from local extension storage. Reset does not revoke a GitHub token on GitHub and does not uninstall the extension.

## Notes

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.

Everything stays local in your browser except the requests made directly to GitHub's API.

The extension does not use outside servers, tracking, analytics, telemetry, CDNs, package managers, or a build system.
