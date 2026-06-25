import assert from 'node:assert/strict';

globalThis.chrome = {
  runtime: { getManifest: () => ({ version: '2.3' }), lastError: null },
  storage: { local: { get: () => {}, set: () => {} } },
  tabs: { create: () => {} },
};

const {
  compareVersions,
  buildVersionCheckStatus,
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
assert.equal(compareVersions('2.4', '2.3.9'), 1);
assert.equal(compareVersions('2.10', '2.9'), 1);
assert.equal(compareVersions('2.4', '2.3.9'), 1);
assert.equal(buildVersionCheckStatus('2.3', '2.3.1', '2026-06-25T00:00:00.000Z').updateAvailable, true);
assert.equal(buildVersionCheckStatus('2.4', '2.3.9', '2026-06-25T00:00:00.000Z').updateAvailable, false);
assert.equal(buildVersionCheckStatus('2.10', '2.9', '2026-06-25T00:00:00.000Z').updateAvailable, false);
assert.equal(buildVersionCheckStatus('2.3', '2.3', '2026-06-25T00:00:00.000Z').localVersion, '2.3');
assert.equal(isVersionCheckStatusStale({ checkedAt: new Date(Date.now() - VERSION_CHECK_CACHE_DURATION_MS - 1).toISOString() }), true);
assert.equal(isVersionCheckStatusStale({ checkedAt: new Date(Date.now() - 1000).toISOString() }), false);
assert.equal(hasQuietWindowPassed({ activeCount: 1, lastFinishedAt: '' }), false);
assert.equal(hasQuietWindowPassed({ activeCount: 0, lastFinishedAt: new Date(Date.now() - VERSION_CHECK_QUIET_WINDOW_MS - 1).toISOString() }), true);
assert.equal(hasQuietWindowPassed({ activeCount: 0, lastFinishedAt: new Date().toISOString() }), false);
