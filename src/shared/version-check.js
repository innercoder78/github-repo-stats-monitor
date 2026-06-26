import { getVersionCheckStatus, saveVersionCheckStatus } from './storage.js';
import { fetchGitHub } from './github-api.js';
import { getGitHubActivityStatus, runTrackedGitHubActivity } from './github-activity.js';

export const VERSION_CHECK_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;
export const VERSION_CHECK_QUIET_WINDOW_MS = 2 * 60 * 1000;
export const LATEST_RELEASE_URL = 'https://github.com/innercoder78/github-repo-stats-monitor/releases/latest';
export const REMOTE_MANIFEST_API_URL = 'https://api.github.com/repos/innercoder78/github-repo-stats-monitor/contents/manifest.json';
export const VERSION_CHECK_ALARM_NAME = 'githubRepoStatsMonitorVersionCheck';

export function parseVersionParts(version) {
  return String(version || '').trim().split('.').map((part) => {
    const numberValue = Number(part);
    return Number.isInteger(numberValue) && numberValue >= 0 ? numberValue : 0;
  });
}

export function compareVersions(left, right) {
  const leftParts = parseVersionParts(left);
  const rightParts = parseVersionParts(right);
  const maxLength = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < maxLength; index += 1) {
    const leftPart = leftParts[index] || 0;
    const rightPart = rightParts[index] || 0;
    if (leftPart > rightPart) return 1;
    if (leftPart < rightPart) return -1;
  }
  return 0;
}

export function getLocalManifestVersion() {
  return String(chrome.runtime.getManifest()?.version || '').trim();
}

export function isVersionCheckStatusStale(status, now = Date.now()) {
  const checkedAt = Date.parse(status?.checkedAt || '');
  return !Number.isFinite(checkedAt) || now - checkedAt >= VERSION_CHECK_CACHE_DURATION_MS;
}

export function hasQuietWindowPassed(activity, now = Date.now()) {
  if (activity?.active) return false;
  const quietUntil = Date.parse(activity?.quietUntil || '');
  if (Number.isFinite(quietUntil)) return now >= quietUntil;
  const finishedAt = Date.parse(activity?.lastFinishedAt || '');
  return !Number.isFinite(finishedAt) || now - finishedAt >= VERSION_CHECK_QUIET_WINDOW_MS;
}

function decodeBase64Json(content) {
  const cleanedContent = String(content || '').replace(/\s/g, '');
  const decoded = atob(cleanedContent);
  return JSON.parse(decoded);
}

async function fetchRemoteManifestVersionNow() {
  const response = await fetchGitHub(REMOTE_MANIFEST_API_URL, {
    headers: {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`Remote manifest request failed with status ${response.status}.`);
  const data = await response.json();
  const manifest = decodeBase64Json(data?.content);
  const version = String(manifest?.version || '').trim();
  if (!version) throw new Error('Remote manifest did not include a version.');
  return version;
}

export function fetchRemoteManifestVersion() {
  return runTrackedGitHubActivity('version-check', fetchRemoteManifestVersionNow);
}

export function buildVersionCheckStatus(localVersion, latestVersion, checkedAt = new Date().toISOString()) {
  return {
    checkedAt,
    localVersion,
    latestVersion,
    updateAvailable: compareVersions(latestVersion, localVersion) > 0,
    latestReleaseUrl: LATEST_RELEASE_URL,
    error: '',
  };
}

export function buildFailedVersionCheckStatus(previousStatus, localVersion, error, checkedAt = new Date().toISOString()) {
  const latestVersion = typeof previousStatus?.latestVersion === 'string' ? previousStatus.latestVersion : '';
  return {
    checkedAt,
    localVersion,
    latestVersion,
    updateAvailable: Boolean(latestVersion) && compareVersions(latestVersion, localVersion) > 0,
    latestReleaseUrl: LATEST_RELEASE_URL,
    error: error?.message || 'Version check failed.',
  };
}

export async function shouldRunVersionCheck() {
  const [status, activity] = await Promise.all([getVersionCheckStatus(), getGitHubActivityStatus()]);
  return isVersionCheckStatusStale(status) && hasQuietWindowPassed(activity);
}

export async function runVersionCheck() {
  const previousStatus = await getVersionCheckStatus();
  const localVersion = getLocalManifestVersion();

  if (!isVersionCheckStatusStale(previousStatus)) return { checked: false, reason: 'cache-fresh' };
  if (!hasQuietWindowPassed(await getGitHubActivityStatus())) return { checked: false, reason: 'not-quiet' };

  try {
    const latestVersion = await fetchRemoteManifestVersion();
    const status = await saveVersionCheckStatus(buildVersionCheckStatus(localVersion, latestVersion));
    return { checked: true, status };
  } catch (error) {
    const status = await saveVersionCheckStatus(buildFailedVersionCheckStatus(previousStatus, localVersion, error));
    return { checked: false, reason: 'failed', status };
  }
}

export function openLatestReleasePage(status = {}) {
  const url = status.latestReleaseUrl || LATEST_RELEASE_URL;
  return chrome.tabs.create({ url });
}
