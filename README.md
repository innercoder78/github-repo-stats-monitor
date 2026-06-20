# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for monitoring GitHub repository stats from one local dashboard.

It is designed for manual review, not real-time monitoring. Data updates when you open the dashboard or use a refresh button. GitHub traffic data covers only the last 14 days, so views, clones, charts, and referring sites follow that same limit.

## Current Version

2.0.0

## What It Shows

Main metrics:

* Views from the last 14 days
* Stars
* Forks
* Clones from the last 14 days

Additional dashboard details:

* Referring Sites / referrers from the last 14 days
* 14-day line charts for Views and Clones
* Last refreshed information for saved data

## Main Features

* Redesigned Dashboard with summary totals, repository cards, traffic charts, and referring sites
* Redesigned Quick Summary popup from the Chrome toolbar
* Settings page for your GitHub token, repositories, appearance, connection test, and reset
* Light Mode and Dark Mode
* Manual refresh from the popup
* Manual refresh from the dashboard
* Repository reordering in Settings
* Repository links that open on GitHub
* Connection test for repo data, traffic views, traffic clones, and referrers
* Helpful error messages when part of a refresh fails
* Reset button that clears the saved token, repositories, appearance preference, and cached stats
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

## Setting It Up

Open **Settings** from the extension popup or dashboard.

Add your repositories using either format:

```text
owner/repo
```

or:

```text
https://github.com/owner/repo
```

The extension saves them internally as `owner/repo`.

You can add up to 20 repositories.

Use the **Appearance** setting to choose **Light Mode** or **Dark Mode**.

## GitHub Token

To use the extension fully, create a GitHub fine-grained personal access token for the repositories you want to monitor.

For normal repository stats, the token needs access to the selected repositories.

For traffic views, traffic clones, and referring sites, GitHub requires the token to have:

```text
Administration: Read-only
```

for those repositories.

The token is stored locally in Chrome extension storage. It is not hard-coded into the extension, and it is not shown outside the password field.

## How Refreshing Works

The dashboard refreshes data when you open it or click **Refresh Now**.

The Quick Summary uses cached data when opened, but it also has a **Refresh** button if you want to update the stats from the popup.

GitHub traffic data only covers the last 14 days, so this extension follows that same limit for Views, Clones, Referring Sites, and the Views and Clones line charts.

The extension does not send notifications and does not update stats in the background automatically.

## Resetting Saved Data

The **Reset** button in Settings clears the saved GitHub token, repository list, appearance preference, and cached repository stats from local Chrome extension storage.

## Notes

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.

Everything stays local in your browser except the requests made directly to GitHub’s API.

The extension does not use outside servers, tracking, analytics, telemetry, CDNs, package managers, or a build system.
