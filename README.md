# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for checking configured GitHub repositories from one local popup, dashboard, and settings experience.

It is designed for manual review plus optional background checks on an interval, not real-time monitoring. GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes.

## Current Version

2.2.1

## Version 2.2.1

Version 2.2.1 is a maintenance and hardening update after Version 2.2. It keeps the extension focused on manual review plus optional interval-based background checks.

* The Dashboard no longer refreshes automatically when opened; use **Refresh Now** or per-repository **Refresh** when you want updated data.
* Background checks include reliability improvements for saved repositories and tracked account follower checks.
* Removed-repository cleanup is improved so stale saved stats and activity state are cleaned up more consistently.
* Settings save now handles related cleanup work together when repository configuration changes are saved.

## What It Shows

Supported repository stats, where available:

* Views
* Stars
* Forks
* Repo Watchers
* Clones
* Referring Sites / referrers

Supported account stats, where available:

* Account Followers

Additional Dashboard and Quick Summary details:

* Repository cards in the same order configured in Settings
* Views and Clones line charts based on GitHub traffic data
* Last refreshed information for saved data
* Last saved values where available when part of a refresh cannot complete
* Green and red activity pills for tracked gains and losses

## Main Views

### Quick Summary

The Chrome toolbar popup provides a compact Quick Summary of saved repository and account values. It reads saved values when opened, shows background-check status, can start a manual refresh for saved repositories, and displays green/red activity pills for tracked gains and losses until reviewed.

### Dashboard

The Dashboard provides a larger review surface with summary totals, account followers, repository cards, traffic charts, referring sites, GitHub repository links, saved-value fallback notices, and per-repository refresh actions. It reads saved values when opened and no longer refreshes automatically on open. Repository order follows the order saved in Settings.

### Settings

Settings manages the GitHub token, repositories, notifications, display preferences, appearance, connection tests, and reset. Date and time display preferences are available with system-default, date-format, and 12-hour/24-hour choices.

## Main Features

* Quick Summary popup from the Chrome toolbar that reads saved values and can run a manual refresh
* Dashboard with summary totals, account followers, repository cards, traffic charts, referring sites, and activity pills
* Settings page for your GitHub token, repositories, notifications, display preferences, appearance, connection test, and reset
* Monitoring multiple repositories, up to the current maximum of 20 configured repositories
* Manual repository entry as `owner/repo` or a GitHub repository URL
* Import from GitHub for repositories the token can access
* Repository reordering in Settings; Settings order controls Dashboard order
* Light Mode and Dark Mode
* Manual full refresh from the Dashboard with progress as repositories complete
* Manual refresh from the popup with progress while saved repositories refresh
* Per-repository Dashboard refresh buttons that update only one repository
* Controlled refresh concurrency for multi-repository refreshes so multiple repositories can refresh efficiently without starting every repository request at once
* Full-refresh coordination so full refreshes and per-repository refreshes do not run at the same time
* Optional background checks on a selected interval
* Optional system notifications for tracked changes
* Optional badge count on the extension icon for places with unreviewed tracked activity
* Notification-tracked stats for Stars, Forks, Repo Watchers, and Account Followers
* Green/red activity pills for tracked gains and losses
* Repository links that open on GitHub
* Connection test for repo data, traffic views, traffic clones, and referrers
* Helpful error messages when part of a refresh fails
* Reset button that clears local Chrome extension storage for this extension
* Local storage only
* No build step
* No external libraries
* No analytics or telemetry

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

Open **Settings** from the extension popup or Dashboard.

A GitHub token is required before repositories can be added, saved, imported, or monitored. The **+ Add repository** button is disabled until token text is entered, and saving repositories without a token is blocked.

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

You can configure up to 20 repositories. The order of repositories in Settings determines the order shown on the Dashboard. You can remove repositories, reorder them, and reset all locally stored extension data from Settings.

Use the **Display Preferences** settings to choose date and time formatting. Use the **Appearance** setting to choose **Light Mode** or **Dark Mode**.

## GitHub Token

To use the extension, create a GitHub personal access token for the repositories you want to monitor. The token is used to import repositories, refresh repository stats, fetch account followers, and run optional background checks.

A fine-grained token can be limited to selected repositories. A token limited to selected repositories can only import and monitor those repositories.

For traffic views, traffic clones, and referring sites, GitHub requires repository access and this fine-grained token permission for those repositories:

```text
Administration: Read-only
```

Account Followers are fetched for the authenticated token's account.

The token is stored locally in Chrome extension storage. It is not hard-coded into the extension, and it is not shown outside the password field. The token is used only for GitHub API requests made by the extension.

## Manual Refresh Behavior

Manual refreshes update saved data when you choose to refresh.

The Dashboard reads saved values when opened and does not refresh automatically on open. Use the full **Refresh Now** action when you want to update Dashboard data. A full Dashboard refresh shows progress as repositories complete. Dashboard repository cards also have a per-repository **Refresh** button. A per-repository refresh updates only that repository.

The Quick Summary popup reads saved values when opened. It can also refresh saved repository stats, and the popup shows progress while repositories refresh.

Full refresh and per-repository refresh do not run at the same time. Multi-repository refreshes use controlled request concurrency so refreshes can make progress across multiple repositories without launching every repository request at once.

If some data cannot be refreshed, the extension shows last saved values where available.

GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes. Views, Clones, Referring Sites, and Views/Clones charts are limited by what GitHub returns for repository traffic.

## Background Checks and Notifications

Background checks are optional and run periodically only when enabled in Settings. You can choose the check interval and the tracked stats: Stars, Forks, Repo Watchers, and Account Followers.

Alerts can be sent by system notification, badge count on the extension icon, or both. Badge counts represent places with unreviewed tracked activity, including account follower activity and repositories with tracked repository-stat activity.

Background checks compare saved baselines against newly fetched values. The Quick Summary and Dashboard show tracked gains and losses as green/red activity pills. Reviewing activity in the popup or Dashboard clears the corresponding badge activity.

These are periodic checks on an interval, not real-time updates.

## Privacy and Security Notes

Everything stays local in your browser except requests made directly to GitHub's API.

The GitHub token is stored locally in Chrome extension storage and is not sent anywhere except GitHub API requests made by the extension. The extension does not send data to outside servers, tracking, analytics, telemetry, CDNs, package managers, or a build system.

Use a read-only fine-grained token limited to the repositories you want to monitor whenever possible.

## Resetting Saved Data

The **Reset** button in Settings clears this extension's local Chrome storage. After Reset, the extension behaves like a fresh local install.

Reset removes the saved token, configured repositories, notification settings and baselines, display preferences, appearance setting, and saved stats from local extension storage. Reset does not revoke a GitHub token on GitHub and does not uninstall the extension.

## Notes

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.
