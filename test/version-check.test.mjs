import assert from 'node:assert/strict';

const storageData = {};
let manifestVersion = '2.3';

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
assert.equal(hasQuietWindowPassed({ activeCount: 1, lastFinishedAt: '' }), false);
assert.equal(hasQuietWindowPassed({ activeCount: 0, lastFinishedAt: new Date(Date.now() - VERSION_CHECK_QUIET_WINDOW_MS - 1).toISOString() }), true);
assert.equal(hasQuietWindowPassed({ activeCount: 0, lastFinishedAt: new Date().toISOString() }), false);

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

storageData.githubApiActivity = { activeCount: 0, lastFinishedAt: '' };
const remoteVersion = await fetchRemoteManifestVersion();
assert.equal(remoteVersion, '2.3.1');
assert.equal(storageData.githubApiActivity.activeCount, 0);
assert.ok(Date.parse(storageData.githubApiActivity.lastFinishedAt));
