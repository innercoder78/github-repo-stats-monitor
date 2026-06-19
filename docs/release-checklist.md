# Release Checklist

Use this checklist before publishing the initial GitHub Release for GitHub Repo Stats Monitor.

## Extension loading

- [ ] Load the extension from a fresh clone with Chrome's "Load unpacked."
- [ ] Confirm the icon files load correctly.
- [ ] Reload the unpacked extension in Chrome.
- [ ] Confirm the popup opens.

## Data refresh

- [ ] Confirm popup Refresh updates cached stats.
- [ ] Confirm dashboard auto-refresh works when the dashboard opens.
- [ ] Confirm dashboard Refresh Now works.
- [ ] Confirm repo name links open GitHub in a new tab.

## Settings and token setup

- [ ] Confirm Settings can save repositories using `owner/repo`.
- [ ] Confirm Settings can save repositories using `https://github.com/owner/repo`.
- [ ] Confirm duplicate repository detection works across both formats.
- [ ] Confirm Test connection checks metadata, traffic views, and referrers.
- [ ] Confirm token instructions mention fine-grained tokens and `Administration: Read-only`.
- [ ] Confirm no token is logged or displayed outside the password field.

## Documentation

- [ ] Confirm README installation instructions are accurate.
