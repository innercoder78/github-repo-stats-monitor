# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for checking saved GitHub repository stats from a redesigned compact Quick Summary, a redesigned larger Dashboard, and Settings.

It is designed for manual review, optional background checks, a cleaner card-based layout, neutral Light Mode, true charcoal Dark Mode, and a simple new-version reminder. It is not real-time monitoring. GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes.

## Current Version

3.2

## How to download

ONLY DOWNLOAD THE VERSION FROM THE LATEST "RELEASES" TAB! If you use the "Download ZIP" straight from the repo, you will be download a beta/broken version.
STABLE VERSIONS ARE ONLY FOUND IN "RELEASES"!!!

## What It Shows

Supported repository stats, where available:

* Views totals based on GitHub traffic data
* Stars
* Forks
* Watchers
* Clones totals based on GitHub traffic data
* Referring Sites / referrers

Supported account stats, where available:

* Account Followers

Additional Dashboard and Quick Summary details:

* Compact Quick Summary cards with saved totals
* Dashboard summary totals and repository cards in the same order configured in Settings
* Per-repository stat rows/cards for saved repository values
* Per-repository referring sites under each repository, limited by what GitHub returns
* Last refreshed information for saved data
* Last saved values where available when part of a refresh cannot complete
* Green and red activity pills for tracked gains and losses on tracked stats

## Main Views

### Quick Summary

The Chrome toolbar popup provides a compact card layout for saved repository and account values. It reads saved totals when opened, shows background-check status, can start a manual refresh for saved repositories, shows an update reminder when a newer version is available, and displays tracked activity pills for accumulated pending gains and losses.

Views and Clones are shown as saved totals based on GitHub traffic data. They do not have activity pills.

### Dashboard

The Dashboard provides a larger review page with summary cards, account followers, repository cards, per-repository stat rows/cards, referring sites under each repository, GitHub repository links, saved-value fallback notices, and per-repository refresh actions. It reads saved values when opened and does not refresh automatically on open. Repository order follows the order saved in Settings.

The Dashboard does not include traffic charts. Views, Clones, and Referring Sites are limited by what GitHub returns for repository traffic.

### Settings

Settings manages the GitHub token, repositories, notifications, display preferences, appearance, connection test, extension version reminder, and reset. Date and time display preferences are available with system-default, date-format, and 12-hour/24-hour choices.

## Main Features

* Redesigned Quick Summary popup from the Chrome toolbar with compact cards, saved totals, background-check status, manual refresh, an update reminder, and tracked activity pills
* Redesigned Dashboard with summary totals, account followers, repository cards, per-repository stat rows/cards, referring sites, saved-value fallback notices, per-repository refresh, and activity pills
* Cleaner card-based layout with neutral Light Mode and true charcoal Dark Mode
* Settings page for your GitHub token, repositories, notifications, display preferences, appearance, connection test, version reminder, and reset
* Monitoring multiple repositories, up to the current maximum of 20 configured repositories
* Manual repository entry as `owner/repo` or a GitHub repository URL
* Import from GitHub for repositories the token can access
* Repository reordering in Settings; Settings order controls Dashboard order
* Manual full refresh from the Dashboard with progress as repositories complete
* Manual refresh from the popup with progress while saved repositories refresh
* Per-repository Dashboard refresh buttons that update only one repository
* Full refresh can use very recently refreshed repository data instead of fetching the same repository again
* Full-refresh coordination so full refreshes and per-repository refreshes do not run at the same time
* Optional background checks on a selected interval
* Optional system notifications for tracked changes
* Optional badge count on the extension icon for places with unreviewed tracked activity
* Notification-tracked stats for Stars, Forks, Repo Watchers, and Account Followers
* Green/red activity pills for tracked gains and losses on tracked stats
* New-version reminder that opens the latest GitHub release when a newer version is available
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

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.

## Repository Configuration

Open **Settings** from the extension popup or Dashboard.

A GitHub token is required before repositories can be added, saved, imported, or checked. The **+ Add repository** button is disabled until token text is entered, and saving repositories without a token is blocked.

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

Import follows GitHub's available next-page links, avoids unnecessary empty-page requests, removes duplicate repository names, and lists the returned repositories in sorted order. Import and **Test Connection** cannot run at the same time. Changing the token ignores older Import and Test Connection results. Changing, adding, removing, or reordering repositories ignores an older Test Connection result. Saving or resetting Settings ignores older results from either operation.

You can configure up to 20 repositories. The order of repositories in Settings determines the order shown on the Dashboard. You can remove repositories, reorder them, and reset all locally stored extension data from Settings.

Use the **Display Preferences** settings to choose date and time formatting. Use the **Appearance** setting to choose **Light Mode** or **Dark Mode**.

## GitHub Token

To use the extension, create a GitHub personal access token for the repositories you want to check. The token is used to import repositories, refresh repository stats, fetch account followers, and run optional background checks.

A fine-grained token can be limited to selected repositories. A token limited to selected repositories can only import and check those repositories.

For traffic views, traffic clones, and referring sites, GitHub requires repository access and this fine-grained token permission for those repositories:

```text
Administration: Read-only
```

Account Followers are fetched for the authenticated token's account.

Each full refresh checks the authenticated account independently, even when recently saved repository data can be reused. A successful account check confirms the GitHub login and follower count before saving them. If it cannot complete, the last successfully saved account values remain available, and refresh feedback identifies account problems separately when appropriate. Switching to a different authenticated GitHub account starts a new account baseline, so the first check for that account does not create a false follower-change alert or activity indicator.

The token is stored locally in Chrome extension storage. It is not hard-coded into the extension, and it is not shown outside the password field. The token is used only for GitHub API requests made by the extension.

## Manual Refresh Behavior

Manual refreshes update saved data when you choose to refresh.

The Dashboard reads saved values when opened and does not refresh automatically on open. Use the full **Refresh Now** action when you want to update Dashboard data. A full Dashboard refresh shows progress as repositories complete. Dashboard repository cards also have a per-repository **Refresh** button. A per-repository refresh updates only that repository.

The Quick Summary popup reads saved values when opened. It can also refresh saved repository and account stats, and the popup shows progress while repositories refresh. A successful refresh returns the popup to its normal **Manual refresh** and **Background check** status lines.

Quick Summary refreshes, Dashboard full refreshes, Dashboard per-repository refreshes, and automatic background checks are coordinated through the extension's background service worker, so conflicting refreshes do not run at the same time. Manual and automatic full refreshes avoid running less than about 60 seconds apart. If a repository was refreshed very recently, a full refresh may reuse that saved data instead of requesting the repository again.

Refresh feedback clearly distinguishes successful, partially successful, failed, and recently reused results. If an individual GitHub endpoint cannot refresh, the extension preserves and shows last saved values where available.

GitHub traffic-related data follows GitHub's traffic window, currently the recent traffic period GitHub exposes. Views, Clones, and Referring Sites are limited by what GitHub returns for repository traffic.

## Background Checks and Notifications

Background checks are optional periodic checks and run only when enabled in Settings while Chrome is running. You can choose the check interval and the tracked stats: Stars, Forks, Repo Watchers, and Account Followers. If a background check became due while Chrome was closed, the extension catches up on the next browser startup.

Alerts can be sent by system notification, badge count on the extension icon, or both. Background checks can set badge counts and system notifications for tracked changes. Badge counts represent places with unreviewed tracked activity, including account follower activity and repositories with tracked repository-stat activity.

Background checks compare saved baselines against newly fetched values. The Quick Summary and Dashboard show net accumulated pending tracked gains and losses from badge and notification checks as green/red activity pills. Views and Clones do not have activity pills.

Quick Summary and Dashboard keep independent activity delivery histories. Reviewing activity in one does not prevent the other from showing the same relevant activity later. New activity found while an earlier delivery is being reviewed is preserved. Badge activity is separate from both view histories and can still be cleared or reduced when reviewed.

These are periodic checks on an interval, not real-time updates. If a background check is due during the manual-refresh quiet window, it retries shortly after that quiet window instead of skipping a full interval. Temporary GitHub failures or a GitHub rate-limit quiet window can also be retried without changing your normal recurring background-check interval.

Removing a repository clears only the data associated with that repository. Changing the GitHub token clears account-specific activity and account baselines while preserving repository-specific statistics and repository activity.

## GitHub Request Reliability

The extension coordinates GitHub API requests across its features, with no more than four raw requests active at once. Safe temporary failures on GET requests may be retried up to three total attempts. Authentication and permission problems, missing repositories, rate limits, and cancelled requests are not treated as temporary retries.

GitHub rate-limit responses can establish a quiet window using GitHub-provided retry or reset timing. Automatic background checks and new-version checks wait or retry after temporary failures or that quiet window without changing their normal recurring intervals. Saved refresh and check timestamps represent successful completion times, not when a request started.

## Import from GitHub and Test Connection

**Test Connection** checks the authenticated account once before checking the configured repositories. If authentication fails, it does not make repository requests. For each repository, it checks repository access first; if that is unavailable, traffic views, clones, and referrers are not requested and appear as **Not tested**. Repository checks use limited parallel work while keeping results in the configured repository order.

## New-Version Reminder

The extension can show a new-version reminder when a newer GitHub release is available. The reminder appears in Quick Summary and Settings and opens the latest GitHub release page.

The new-version reminder is manual. It does not install updates and does not update the extension. It only opens the latest GitHub release so you can update manually.

## Privacy and Security Notes

Everything stays local in your browser except requests made directly to GitHub's API.

The GitHub token is stored locally in Chrome extension storage and is not sent anywhere except GitHub API requests made by the extension. The extension does not send data to outside servers, tracking, analytics, telemetry, CDNs, package managers, or a build system.

Use a read-only fine-grained token limited to the repositories you want to check whenever possible.

## Resetting Saved Data

The **Reset** button in Settings clears this extension's local Chrome storage. After Reset, the extension behaves like a fresh local install.

Reset removes the saved token, configured repositories, notification settings and baselines, display preferences, appearance setting, and saved stats from local extension storage. Reset does not revoke a GitHub token on GitHub and does not uninstall the extension.

## Notes

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.

The new-version reminder does not install updates. It only opens the latest GitHub release so you can update manually.

## Screenshots

I'm not going to post a whole bunch of screenshots but just a few so you can get an idea of what it looks like.

Here is the Dashboard, in both Dark Mode and Light Mode (you can toggle Dark or Light Mode in Settings):

<img width="1181" height="1034" alt="Dashboard - dark" src="https://github.com/user-attachments/assets/8f63a76a-3f49-43d4-8f41-967d8fed8641" />

<img width="1184" height="1040" alt="Dashboard - light" src="https://github.com/user-attachments/assets/087f7116-cf9c-4a96-9bcf-678337efa588" />

And here is the Quick Summary that lets you see the combined stats of all repos at a glance:

<img width="372" height="630" alt="Quick Summary" src="https://github.com/user-attachments/assets/99c3dacb-4c7f-48cb-89ad-6edca0c35a86" />
