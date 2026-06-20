# GitHub Repo Stats Monitor

GitHub Repo Stats Monitor is a personal Chrome extension for keeping an eye on your GitHub repositories from one local dashboard.

It shows repo stats, recent traffic, unique visitors, and referring sites without making you open each repository’s GitHub Insights page one by one.

## What It Shows

* Stars
* Forks
* Real watchers
* Views from the last 14 days
* Unique visitors from the last 14 days
* Referring sites from the last 14 days
* Simple traffic charts
* Last refreshed information

The extension uses GitHub’s real watcher count from `subscribers_count`, not the misleading `watchers_count` value that often mirrors stars.

## Main Features

* Dashboard page with one card per repository
* Quick Summary popup from the Chrome toolbar
* Settings page for your GitHub token and repository list
* Manual refresh from the popup
* Manual refresh from the dashboard
* Repository reordering in Settings
* Repository links that open on GitHub
* Connection test for repo data, traffic, and referrers
* Helpful error messages when part of a refresh fails
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

## GitHub Token

To use the extension fully, create a GitHub fine-grained personal access token for the repositories you want to monitor.

For normal repository stats, the token needs access to the selected repositories.

For traffic views and referring sites, GitHub requires the token to have:

```text
Administration: Read-only
```

for those repositories.

The token is stored locally in Chrome extension storage. It is not hard-coded into the extension, and it is not shown outside the password field.

## How Refreshing Works

The dashboard refreshes data when you open it or click **Refresh Now**.

The Quick Summary uses cached data when opened, but it also has a **Refresh** button if you want to update the stats from the popup.

GitHub traffic data only covers the last 14 days, so this extension follows that same limit.

## Notes

This extension is not published in the Chrome Web Store. Chrome will not auto-update it like a Web Store extension.

Everything stays local in your browser except the requests made directly to GitHub’s API.

The extension does not use outside servers, tracking, analytics, telemetry, CDNs, package managers, or a build system.
