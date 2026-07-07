import assert from 'node:assert/strict';

const storageData = {};
let manifestVersion = '2.3';
let storageSetCount = 0;
let fetchCallCount = 0;

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

globalThis.fetch = async () => {
  fetchCallCount += 1;
  return {
    ok: true,
    json: async () => ({ content: btoa(JSON.stringify({ version: '2.3.1' })) }),
  };
};

const {
  compareVersions,
  buildFailedVersionCheckStatus,
  buildVersionCheckStatus,
  fetchRemoteManifestVersion,
  isVersionCheckStatusStale,
  getEffectiveVersionCheckStatus,
  hasQuietWindowPassed,
  runVersionCheck,
  shouldRunVersionCheck,
  shouldShowUpdateAvailable,
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
assert.equal(shouldShowUpdateAvailable({ updateAvailable: true, localVersion: '2.3', latestVersion: '2.3.1' }), true);
assert.equal(shouldShowUpdateAvailable({ updateAvailable: false, localVersion: '2.3', latestVersion: '2.3.1' }), false);
assert.equal(shouldShowUpdateAvailable({ updateAvailable: true, localVersion: '', latestVersion: '2.3.1' }), false);
assert.equal(shouldShowUpdateAvailable({ updateAvailable: true, localVersion: '2.3', latestVersion: '' }), false);
assert.equal(shouldShowUpdateAvailable({ updateAvailable: true, localVersion: '2.3', latestVersion: '2.3' }), false);
assert.equal(shouldShowUpdateAvailable({ updateAvailable: true, localVersion: '2.4', latestVersion: '2.3.9' }), false);
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

manifestVersion = '3.1';
const staleStoredLocalVersion = {
  checkedAt: new Date().toISOString(),
  localVersion: '3.0',
  latestVersion: '3.1',
  updateAvailable: true,
  latestReleaseUrl: 'https://example.test/release',
  error: '',
};
const effectiveCaughtUp = getEffectiveVersionCheckStatus(staleStoredLocalVersion);
assert.equal(effectiveCaughtUp.localVersion, '3.1');
assert.equal(effectiveCaughtUp.latestVersion, '3.1');
assert.equal(effectiveCaughtUp.updateAvailable, false);
assert.equal(shouldShowUpdateAvailable(effectiveCaughtUp), false);

const effectiveStillBehind = getEffectiveVersionCheckStatus({
  ...staleStoredLocalVersion,
  latestVersion: '3.2',
});
assert.equal(effectiveStillBehind.localVersion, '3.1');
assert.equal(effectiveStillBehind.latestVersion, '3.2');
assert.equal(effectiveStillBehind.updateAvailable, true);
assert.equal(shouldShowUpdateAvailable(effectiveStillBehind), true);

storageData.versionCheckStatus = staleStoredLocalVersion;
storageData[GITHUB_ACTIVITY_KEY] = {};
storageSetCount = 0;
fetchCallCount = 0;
assert.equal(await shouldRunVersionCheck(), true);
const reconciledVersionCheck = await runVersionCheck();
assert.equal(reconciledVersionCheck.checked, false);
assert.equal(reconciledVersionCheck.reason, 'reconciled-local-version');
assert.equal(reconciledVersionCheck.status.localVersion, '3.1');
assert.equal(reconciledVersionCheck.status.updateAvailable, false);
assert.equal(storageData.versionCheckStatus.localVersion, '3.1');
assert.equal(storageData.versionCheckStatus.updateAvailable, false);
assert.equal(storageSetCount, 1);
assert.equal(fetchCallCount, 0);
assert.equal(await shouldRunVersionCheck(), false);
manifestVersion = '2.3';

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

const {
  runExclusiveFullRefresh,
  refreshStatsCache,
  runExclusiveRepositoryRefresh,
  wasManualGitHubRequestRecentlyCompleted,
  getManualRefreshQuietWindowRemainingMs,
} = await import('../src/shared/refresh-stats.js');

storageData.fullRefreshCoordination = {};
storageData[GITHUB_ACTIVITY_KEY] = {};
storageSetCount = 0;
let fullRefreshRunCount = 0;
storageData.fullRefreshCoordination = {
  lastCompletedAt: new Date(Date.now() - 20 * 1000).toISOString(),
  lastCompletedBy: 'background',
};
const manualAfterBackgroundFresh = await runExclusiveFullRefresh('dashboard', async () => {
  fullRefreshRunCount += 1;
  return { fetchedAt: new Date().toISOString() };
});
assert.equal(manualAfterBackgroundFresh.skipped, true);
assert.equal(manualAfterBackgroundFresh.reason, 'completed-recently');
assert.equal(manualAfterBackgroundFresh.source, 'background');
assert.equal(fullRefreshRunCount, 0);

storageData.fullRefreshCoordination = {
  lastCompletedAt: new Date(Date.now() - 61 * 1000).toISOString(),
  lastCompletedBy: 'background',
};
const manualAfterBackgroundExpired = await runExclusiveFullRefresh('dashboard', async () => {
  fullRefreshRunCount += 1;
  return { fetchedAt: new Date().toISOString() };
});
assert.equal(manualAfterBackgroundExpired.skipped, false);
assert.equal(fullRefreshRunCount, 1);
assert.equal(storageData.fullRefreshCoordination.lastCompletedBy, 'dashboard');
assert.ok(await getManualRefreshQuietWindowRemainingMs() > 45 * 1000);

const manualAfterManualFresh = await runExclusiveFullRefresh('quick-summary', async () => {
  fullRefreshRunCount += 1;
  return { fetchedAt: new Date().toISOString() };
});
assert.equal(manualAfterManualFresh.skipped, true);
assert.equal(manualAfterManualFresh.reason, 'completed-recently');
assert.equal(manualAfterManualFresh.source, 'dashboard');
assert.equal(fullRefreshRunCount, 1);

storageData.fullRefreshCoordination = {};
storageData[GITHUB_ACTIVITY_KEY] = {};
storageSetCount = 0;
const repoARefresh = await runExclusiveRepositoryRefresh('Owner/Repo-A', async () => ({ fetchedAt: '2026-06-25T13:00:00.000Z', repository: 'owner/repo-a' }));
assert.equal(repoARefresh.skipped, false);
assert.equal(await wasManualGitHubRequestRecentlyCompleted(), false);
assert.equal(storageData.fullRefreshCoordination.lastManualRequestCompletedAt || '', '');
assert.equal(storageData.fullRefreshCoordination.lastRepositoryRequestCompletedRepository, 'owner/repo-a');
status = await getGitHubActivityStatus();
assert.equal(status.active, false);
assert.equal(status.lastFinishedSource, 'dashboard-repository');

const repoBRefresh = await runExclusiveRepositoryRefresh('owner/repo-b', async () => ({ fetchedAt: '2026-06-25T13:00:01.000Z', repository: 'owner/repo-b' }));
assert.equal(repoBRefresh.skipped, false);
assert.equal(storageData.fullRefreshCoordination.lastRepositoryRequestCompletedRepository, 'owner/repo-b');
assert.equal(storageData.fullRefreshCoordination.lastManualRequestCompletedAt || '', '');

storageData.fullRefreshCoordination.completedRepositoryRefreshes = {
  'owner/repo-a': { repository: 'owner/repo-a', source: 'dashboard-repository', completedAt: new Date().toISOString() },
  'owner/repo-b': { repository: 'owner/repo-b', source: 'dashboard-repository', completedAt: new Date().toISOString() },
};
let fetchedUrls = [];
globalThis.fetch = async (url) => {
  fetchedUrls.push(String(url));
  if (String(url).includes('/traffic/views')) {
    return { ok: true, json: async () => ({ count: 10, uniques: 5, views: [] }) };
  }
  if (String(url).includes('/traffic/clones')) {
    return { ok: true, json: async () => ({ count: 4, clones: [] }) };
  }
  if (String(url).includes('/traffic/popular/referrers')) {
    return { ok: true, json: async () => ([]) };
  }
  if (String(url).endsWith('/user')) {
    return { ok: true, json: async () => ({ login: 'owner', followers: 12 }) };
  }
  return { ok: true, json: async () => ({ stargazers_count: 7, forks_count: 3, subscribers_count: 2 }) };
};
const skippedRepositoryRefresh = await refreshStatsCache(
  { githubToken: 'token', repositories: ['owner/repo-a', 'owner/repo-b', 'owner/repo-c'] },
  {
    'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'cached' },
    'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'cached' },
  },
  { source: 'dashboard', skipFullRefreshCoordination: true },
);
assert.deepEqual(skippedRepositoryRefresh.skippedRepositories, ['owner/repo-a', 'owner/repo-b']);
assert.equal(skippedRepositoryRefresh.results.length, 1);
assert.equal(skippedRepositoryRefresh.results[0].repository, 'owner/repo-c');
assert.equal(fetchedUrls.some((url) => url.includes('/repos/owner/repo-a')), false);
assert.equal(fetchedUrls.some((url) => url.includes('/repos/owner/repo-b')), false);
assert.equal(fetchedUrls.some((url) => url.includes('/repos/owner/repo-c')), true);

fetchedUrls = [];
const allSkippedRepositoryRefresh = await refreshStatsCache(
  { githubToken: 'token', repositories: ['owner/repo-a', 'owner/repo-b'] },
  {
    'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'cached' },
    'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'cached' },
  },
  { source: 'dashboard', skipFullRefreshCoordination: true },
);
assert.deepEqual(allSkippedRepositoryRefresh.skippedRepositories, ['owner/repo-a', 'owner/repo-b']);
assert.equal(allSkippedRepositoryRefresh.results.length, 0);
assert.deepEqual(fetchedUrls, []);

let releaseRepoA;
const runningRepoA = runExclusiveRepositoryRefresh('owner/repo-a', () => new Promise((resolve) => {
  releaseRepoA = () => resolve({ fetchedAt: '2026-06-25T13:00:02.000Z', repository: 'owner/repo-a' });
}));
await new Promise((resolve) => setTimeout(resolve, 0));
const duplicateRepoA = await runExclusiveRepositoryRefresh('owner/repo-a', async () => ({ fetchedAt: '2026-06-25T13:00:03.000Z' }));
assert.equal(duplicateRepoA.skipped, true);
assert.equal(duplicateRepoA.reason, 'running');
releaseRepoA();
assert.equal((await runningRepoA).skipped, false);

const fullRefreshAfterRepository = await runExclusiveFullRefresh('dashboard', async () => ({ fetchedAt: '2026-06-25T13:00:04.000Z' }));
assert.equal(fullRefreshAfterRepository.skipped, false);
assert.equal(storageData.fullRefreshCoordination.lastManualRequestCompletedAt, '2026-06-25T13:00:04.000Z');
assert.equal(storageData.fullRefreshCoordination.lastManualRequestCompletedBy, 'dashboard');

storageData.fullRefreshCoordination = {
  lastCompletedAt: new Date(Date.now() - 20 * 1000).toISOString(),
  lastCompletedBy: 'dashboard',
  lastManualRequestCompletedAt: new Date(Date.now() - 10 * 1000).toISOString(),
  lastManualRequestCompletedBy: 'quick-summary',
};
let quietWindowRemainingMs = await getManualRefreshQuietWindowRemainingMs();
assert.ok(quietWindowRemainingMs > 45 * 1000);
assert.ok(quietWindowRemainingMs <= 60 * 1000);
storageData.fullRefreshCoordination.lastManualRequestCompletedAt = new Date(Date.now() - 61 * 1000).toISOString();
storageData.fullRefreshCoordination.lastCompletedAt = new Date(Date.now() - 61 * 1000).toISOString();
quietWindowRemainingMs = await getManualRefreshQuietWindowRemainingMs();
assert.equal(quietWindowRemainingMs, 0);

const { buildGitHubRequestErrorMessage, fetchRepositoryTrafficReferrers, fetchRepositoryTrafficViews } = await import('../src/shared/github-api.js');

function createHeaders(values = {}) {
  const normalized = Object.fromEntries(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return {
    get(name) {
      return normalized[String(name).toLowerCase()] || null;
    },
  };
}

assert.equal(
  buildGitHubRequestErrorMessage({ status: 401 }),
  'GitHub rejected the saved token. Check that the token is valid and still active.',
);
assert.equal(
  buildGitHubRequestErrorMessage({ status: 404, context: 'repository-metadata' }),
  'Repository data unavailable. The repository was not found, or the token does not have access to it.',
);
assert.equal(
  buildGitHubRequestErrorMessage({ status: 403, context: 'traffic-views', headers: createHeaders({ 'x-ratelimit-remaining': '42' }) }),
  'Traffic data unavailable. Check that your token has Administration: Read-only permission for this repository.',
);
assert.match(
  buildGitHubRequestErrorMessage({ status: 403, headers: createHeaders({ 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1782561600' }) }),
  /^GitHub API rate limit reached\. Last saved values are shown where available\. Try again after .+\.$/,
);
assert.equal(
  buildGitHubRequestErrorMessage({ status: 403, headers: createHeaders({ 'x-ratelimit-remaining': '12', 'retry-after': '90' }) }),
  'GitHub’s secondary rate limit was triggered. Wait 1 minute and 30 seconds before refreshing again. Last saved values are shown where available.',
);
assert.equal(
  buildGitHubRequestErrorMessage({ status: 429, headers: createHeaders({ 'x-ratelimit-remaining': '12' }) }),
  'GitHub is rate limiting requests. Try again later. Last saved values are shown where available.',
);

globalThis.fetch = async (url) => {
  if (String(url).includes('/traffic/views')) {
    return {
      ok: false,
      status: 403,
      headers: createHeaders({ 'x-ratelimit-remaining': '8' }),
      json: async () => ({ message: 'Resource not accessible by personal access token' }),
    };
  }

  return {
    ok: false,
    status: 403,
    headers: createHeaders({ 'x-ratelimit-remaining': '8' }),
    json: async () => ({ message: 'Resource not accessible by personal access token' }),
  };
};

await assert.rejects(
  fetchRepositoryTrafficViews('owner/repo-a', 'token'),
  /Traffic data unavailable\. Check that your token has Administration: Read-only permission for this repository\./,
);
await assert.rejects(
  fetchRepositoryTrafficReferrers('owner/repo-a', 'token'),
  /Traffic data unavailable\. Check that your token has Administration: Read-only permission for this repository\./,
);

globalThis.fetch = async () => {
  throw new TypeError('Failed to fetch');
};
await assert.rejects(
  fetchRepositoryTrafficViews('owner/repo-a', 'token'),
  /GitHub could not be reached\. Check your connection and try again\./,
);
