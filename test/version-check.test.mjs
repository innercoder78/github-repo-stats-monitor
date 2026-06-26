import assert from 'node:assert/strict';

const storageData = {};
let manifestVersion = '2.3';
let storageSetCount = 0;

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: manifestVersion }),
    lastError: null,
  },
  storage: {
    local: {
      get(defaults, callback) {
        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
          if (Object.hasOwn(storageData, key)) {
            result[key] = storageData[key];
          }
        });
        callback(result);
      },
      set(values, callback) {
        storageSetCount += 1;
        Object.assign(storageData, values);
        callback?.();
      },
    },
  },
  tabs: { create: () => {} },
};

globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ content: btoa(JSON.stringify({ version: '2.3.1' })) }),
});

const {
  compareVersions,
  buildFailedVersionCheckStatus,
  buildVersionCheckStatus,
  fetchRemoteManifestVersion,
  isVersionCheckStatusStale,
  hasQuietWindowPassed,
  VERSION_CHECK_CACHE_DURATION_MS,
  VERSION_CHECK_QUIET_WINDOW_MS,
} = await import('../src/shared/version-check.js');
const {
  GITHUB_ACTIVITY_KEY,
  GITHUB_ACTIVITY_STALE_MS,
  GITHUB_ACTIVITY_QUIET_WINDOW_MS,
  getGitHubActivityStatus,
  markGitHubActivityFinished,
  markGitHubActivityStarted,
} = await import('../src/shared/github-activity.js');
const { fetchRepositoryMetadata } = await import('../src/shared/github-api.js');

assert.equal(compareVersions('2.3.1', '2.3'), 1);
assert.equal(compareVersions('2.3.2', '2.3.1'), 1);
assert.equal(compareVersions('2.4', '2.3.9'), 1);
assert.equal(compareVersions('2.10', '2.9'), 1);
assert.equal(compareVersions('2.3', '2.3.0'), 0);
assert.equal(buildVersionCheckStatus('2.3', '2.3.1', '2026-06-25T00:00:00.000Z').updateAvailable, true);
assert.equal(buildVersionCheckStatus('2.4', '2.3.9', '2026-06-25T00:00:00.000Z').updateAvailable, false);
assert.equal(buildVersionCheckStatus('2.10', '2.9', '2026-06-25T00:00:00.000Z').updateAvailable, false);
assert.equal(buildVersionCheckStatus('2.3', '2.3', '2026-06-25T00:00:00.000Z').localVersion, '2.3');
assert.equal(isVersionCheckStatusStale({ checkedAt: new Date(Date.now() - VERSION_CHECK_CACHE_DURATION_MS - 1).toISOString() }), true);
assert.equal(isVersionCheckStatusStale({ checkedAt: new Date(Date.now() - 1000).toISOString() }), false);
assert.equal(hasQuietWindowPassed({ active: true, quietUntil: '' }), false);
assert.equal(hasQuietWindowPassed({ active: false, quietUntil: new Date(Date.now() - 1).toISOString() }), true);
assert.equal(hasQuietWindowPassed({ active: false, quietUntil: new Date(Date.now() + VERSION_CHECK_QUIET_WINDOW_MS).toISOString() }), false);

const failedCheckedAt = '2026-06-25T12:00:00.000Z';
const failedKnownUpdate = buildFailedVersionCheckStatus(
  { localVersion: '2.2.2', latestVersion: '2.3', updateAvailable: true },
  '2.2.2',
  new Error('Network failed'),
  failedCheckedAt,
);
assert.equal(failedKnownUpdate.checkedAt, failedCheckedAt);
assert.equal(isVersionCheckStatusStale(failedKnownUpdate, Date.parse(failedCheckedAt) + 1000), false);
assert.equal(failedKnownUpdate.updateAvailable, true);
assert.equal(failedKnownUpdate.localVersion, '2.2.2');

const failedCaughtUp = buildFailedVersionCheckStatus(
  { localVersion: '2.2.2', latestVersion: '2.3', updateAvailable: true },
  '2.3',
  new Error('Network failed'),
  failedCheckedAt,
);
assert.equal(failedCaughtUp.localVersion, '2.3');
assert.equal(failedCaughtUp.latestVersion, '2.3');
assert.equal(failedCaughtUp.updateAvailable, false);

storageData[GITHUB_ACTIVITY_KEY] = {};
storageSetCount = 0;
const operationA = await markGitHubActivityStarted('manual-refresh');
const operationB = await markGitHubActivityStarted('connection-test');
let status = await getGitHubActivityStatus();
assert.equal(status.active, true);
assert.equal(Object.keys(status.activeOperations).length, 2);
assert.equal(hasQuietWindowPassed(status), false);
await markGitHubActivityFinished(operationB, 'connection-test');
status = await getGitHubActivityStatus();
assert.equal(status.active, true);
assert.equal(Object.keys(status.activeOperations).length, 1);
assert.ok(status.activeOperations[operationA.token]);
assert.equal(hasQuietWindowPassed(status), false);
await markGitHubActivityFinished(operationA, 'manual-refresh');
status = await getGitHubActivityStatus();
assert.equal(status.active, false);
assert.equal(Object.keys(status.activeOperations).length, 0);
assert.equal(hasQuietWindowPassed(status), false);
assert.equal(storageSetCount, 4);

storageData[GITHUB_ACTIVITY_KEY] = {
  activeOperations: {
    stale: {
      source: 'manual-refresh',
      startedAt: new Date(Date.now() - GITHUB_ACTIVITY_STALE_MS - 1000).toISOString(),
      activeUntil: new Date(Date.now() - 1000).toISOString(),
    },
  },
  quietUntil: new Date(Date.now() - 1000).toISOString(),
};
status = await getGitHubActivityStatus();
assert.equal(status.active, false);
assert.equal(Object.keys(status.activeOperations).length, 0);
assert.equal(hasQuietWindowPassed(status), true);

status = {
  active: false,
  activeOperations: {},
  quietUntil: new Date(Date.now() + GITHUB_ACTIVITY_QUIET_WINDOW_MS).toISOString(),
};
assert.equal(hasQuietWindowPassed(status), false);

storageData[GITHUB_ACTIVITY_KEY] = {};
storageSetCount = 0;
await fetchRepositoryMetadata('innercoder78/github-repo-stats-monitor', 'token');
assert.equal(storageSetCount, 0);
assert.deepEqual(storageData[GITHUB_ACTIVITY_KEY], {});

const remoteVersion = await fetchRemoteManifestVersion();
assert.equal(remoteVersion, '2.3.1');
status = await getGitHubActivityStatus();
assert.equal(status.active, false);
assert.ok(Date.parse(status.lastFinishedAt));
assert.equal(status.lastFinishedSource, 'version-check');
