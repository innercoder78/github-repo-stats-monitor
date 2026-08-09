import assert from 'node:assert/strict';

const storageData = {};
const alarms = new Map();
let storageGetError = null;
let storageSetError = null;
let storageGetErrorKey = null;
let fetchCalls = [];
let storageSetCount = 0;
let onStorageSet = null;
const notificationCalls = [];
const badgeTextCalls = [];

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.1' }),
    getURL: (path) => path,
    lastError: null,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener() {} },
    sendMessage: () => Promise.resolve(),
  },
  storage: {
    local: {
      get(defaults, callback) {
        if (storageGetError && (!storageGetErrorKey || Object.hasOwn(defaults, storageGetErrorKey))) {
          chrome.runtime.lastError = storageGetError;
          callback({});
          chrome.runtime.lastError = null;
          return;
        }

        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
          if (Object.hasOwn(storageData, key)) {
            result[key] = clone(storageData[key]);
          }
        });
        callback(result);
      },
      set(values, callback) {
        if (storageSetError) {
          chrome.runtime.lastError = storageSetError;
          callback?.();
          chrome.runtime.lastError = null;
          return;
        }

        storageSetCount += 1;
        if (typeof onStorageSet === 'function') onStorageSet(values);
        Object.assign(storageData, clone(values));
        callback?.();
      },
      clear(callback) {
        Object.keys(storageData).forEach((key) => delete storageData[key]);
        callback?.();
      },
    },
    onChanged: { addListener() {} },
  },
  alarms: {
    create(name, info) {
      alarms.set(name, clone(info));
      return Promise.resolve();
    },
    clear(name) {
      alarms.delete(name);
      return Promise.resolve(true);
    },
    onAlarm: { addListener() {} },
  },
  action: {
    setBadgeText: (options) => { badgeTextCalls.push(options); return Promise.resolve(); },
    setBadgeBackgroundColor: () => Promise.resolve(),
  },
  notifications: {
    create: (id, options, callback) => { notificationCalls.push({ id, options }); callback?.(); return Promise.resolve(); },
  },
};

globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  return { ok: true, json: async () => ({}) };
};

const {
  BACKGROUND_CHECK_ALARM_NAME,
  BACKGROUND_CHECK_RETRY_ALARM_NAME,
  __refreshCoordinationTest,
} = await import('../src/background.js');
const { runExclusiveFullRefresh } = await import('../src/shared/refresh-stats.js');
const api = await import('../src/shared/github-api.js');
const { mergeLatestStats, mutateLatestStats, patchLatestStats, removeUnconfiguredLatestStats } = await import('../src/shared/storage.js');

function resetState() {
  Object.keys(storageData).forEach((key) => delete storageData[key]);
  alarms.clear();
  storageGetError = null;
  storageSetError = null;
  storageGetErrorKey = null;
  fetchCalls = [];
  storageSetCount = 0;
  onStorageSet = null;
  notificationCalls.length = 0;
  badgeTextCalls.length = 0;
  __refreshCoordinationTest.clearActiveRefreshOperationForTest();
}

resetState();
let now = Date.now();
const realDateNow = Date.now;
Date.now = () => now;
const liveAdmission = await __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' });
assert.equal(liveAdmission.admitted, true);
now += 3 * 60 * 1000;
const blockedByLiveOperation = await __refreshCoordinationTest.beginRefreshOperation({ type: 'repository', source: 'dashboard-repository', repository: 'owner/repo' });
assert.equal(blockedByLiveOperation.admitted, false);
assert.equal(blockedByLiveOperation.reason, 'running');
await __refreshCoordinationTest.finishRefreshOperation(liveAdmission.operation);
Date.now = realDateNow;

resetState();
storageData.refreshOperationState = {
  id: 'old-operation',
  type: 'full',
  source: 'dashboard',
  repository: '',
  startedAt: new Date(Date.now() - 3 * 60 * 1000).toISOString(),
};
const staleAdmission = await __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'quick-summary' });
assert.equal(staleAdmission.admitted, true);
assert.notEqual(storageData.refreshOperationState.id, 'old-operation');
await __refreshCoordinationTest.finishRefreshOperation(staleAdmission.operation);

resetState();
storageGetError = new Error('storage get failed');
await assert.rejects(
  __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' }),
  /storage get failed/,
);
storageGetError = null;
assert.equal(__refreshCoordinationTest.getActiveRefreshOperation(), null);
const admissionAfterGetFailure = await __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' });
assert.equal(admissionAfterGetFailure.admitted, true);
await __refreshCoordinationTest.finishRefreshOperation(admissionAfterGetFailure.operation);

resetState();
storageSetError = new Error('storage set failed');
await assert.rejects(
  __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' }),
  /storage set failed/,
);
storageSetError = null;
assert.equal(__refreshCoordinationTest.getActiveRefreshOperation(), null);
const admissionAfterSetFailure = await __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' });
assert.equal(admissionAfterSetFailure.admitted, true);
await __refreshCoordinationTest.finishRefreshOperation(admissionAfterSetFailure.operation);

resetState();
const olderAdmission = await __refreshCoordinationTest.beginRefreshOperation({ type: 'full', source: 'dashboard' });
storageData.refreshOperationState = {
  id: 'newer-operation',
  type: 'repository',
  source: 'dashboard-repository',
  repository: 'owner/repo',
  startedAt: new Date().toISOString(),
};
await __refreshCoordinationTest.finishRefreshOperation(olderAdmission.operation);
assert.equal(storageData.refreshOperationState.id, 'newer-operation');

resetState();
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: false },
};
storageData.lastBackgroundCheckAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
storageData.refreshOperationState = {
  id: 'running-operation',
  type: 'full',
  source: 'dashboard',
  repository: '',
  startedAt: new Date().toISOString(),
};
await __refreshCoordinationTest.scheduleBackgroundCheckAlarm({ catchUpIfDue: true });
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 30, periodInMinutes: 30 });

resetState();
let releaseFullRefresh;
const runningFullRefresh = runExclusiveFullRefresh('dashboard', () => new Promise((resolve) => {
  releaseFullRefresh = () => resolve({ fetchedAt: new Date().toISOString(), complete: true });
}));
await new Promise((resolve) => setTimeout(resolve, 0));
const repositoryRefreshWhileFullRunning = __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
await new Promise((resolve) => setTimeout(resolve, 0));
assert.equal(__refreshCoordinationTest.getActiveRefreshOperation(), null);
releaseFullRefresh();
assert.equal((await runningFullRefresh).skipped, false);
const repositoryRefreshResult = await repositoryRefreshWhileFullRunning;
assert.equal(repositoryRefreshResult.skipped, true);
assert.equal(repositoryRefreshResult.reason, 'completed-recently');
assert.equal(fetchCalls.length, 0);

resetState();
storageData.latestStats = {
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'new-b' },
};
const mergedLatestStats = await mergeLatestStats({
  'owner/repo-a': { repository: 'owner/repo-a', stars: 3, forks: 1, subscribers: 1, fetchedAt: 'new-a' },
});
assert.equal(mergedLatestStats['owner/repo-a'].stars, 3);
assert.equal(mergedLatestStats['owner/repo-b'].stars, 2);
assert.equal(storageData.latestStats['owner/repo-b'].fetchedAt, 'new-b');


resetState();
storageData.repositories = ['owner/repo-a'];
storageData.latestStats = {
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'old-b' },
};
let releaseQueuedRefresh;
const queuedRefresh = mutateLatestStats(async (currentLatestStats) => {
  await new Promise((resolve) => {
    releaseQueuedRefresh = resolve;
  });
  return {
    ...currentLatestStats,
    'owner/repo-a': { ...currentLatestStats['owner/repo-a'], stars: 10, fetchedAt: 'new-a' },
    'owner/repo-b': { ...currentLatestStats['owner/repo-b'], stars: 20, fetchedAt: 'new-b' },
  };
});
const queuedCleanup = removeUnconfiguredLatestStats();
while (typeof releaseQueuedRefresh !== 'function') {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
releaseQueuedRefresh();
await Promise.all([queuedRefresh, queuedCleanup]);
assert.equal(storageData.latestStats['owner/repo-a'].stars, 10);
assert.equal(storageData.latestStats['owner/repo-a'].fetchedAt, 'new-a');
assert.equal(storageData.latestStats['owner/repo-b'], undefined);

resetState();
storageData.repositories = ['owner/repo-a'];
storageData.latestStats = {
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'cached-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'cached-b' },
  'owner/repo-c': { repository: 'owner/repo-c', stars: 3, forks: 3, subscribers: 3, fetchedAt: 'cached-c' },
};
let releaseBlockingMutation;
const blockingMutation = mutateLatestStats(async (currentLatestStats) => {
  await new Promise((resolve) => {
    releaseBlockingMutation = resolve;
  });
  return currentLatestStats;
});
const queuedSettingsCleanup = removeUnconfiguredLatestStats();
while (typeof releaseBlockingMutation !== 'function') {
  await new Promise((resolve) => setTimeout(resolve, 0));
}
storageData.repositories = ['owner/repo-a', 'owner/repo-b'];
releaseBlockingMutation();
await Promise.all([blockingMutation, queuedSettingsCleanup]);
assert.equal(storageData.latestStats['owner/repo-a'].fetchedAt, 'cached-a');
assert.equal(storageData.latestStats['owner/repo-b'].fetchedAt, 'cached-b');
assert.equal(storageData.latestStats['owner/repo-c'], undefined);


resetState();
storageData.repositories = ['owner/repo-a'];
storageData.latestStats = {
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'old-b' },
};
await removeUnconfiguredLatestStats();
await mergeLatestStats({
  'owner/repo-a': { repository: 'owner/repo-a', stars: 11, forks: 1, subscribers: 1, fetchedAt: 'new-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 22, forks: 2, subscribers: 2, fetchedAt: 'new-b' },
}, { configuredOnly: true });
assert.equal(storageData.latestStats['owner/repo-a'].stars, 11);
assert.equal(storageData.latestStats['owner/repo-b'], undefined);

resetState();
storageData.repositories = ['owner/repo-a'];
storageData.latestStats = {
  'owner/repo-a': {
    repository: 'owner/repo-a',
    stars: 1,
    forks: 1,
    subscribers: 1,
    views: 44,
    uniqueVisitors: 11,
    clones: 7,
    referrers: [{ referrer: 'example.test', count: 3, uniques: 2 }],
    trafficFetchedAt: 'traffic-new',
    clonesFetchedAt: 'clones-new',
    referrersFetchedAt: 'referrers-new',
  },
};
await patchLatestStats({
  'owner/repo-a': { stars: 5, forks: 2, subscribers: 4, fetchedAt: 'metadata-new', error: '' },
}, { configuredOnly: true });
assert.equal(storageData.latestStats['owner/repo-a'].stars, 5);
assert.equal(storageData.latestStats['owner/repo-a'].views, 44);
assert.equal(storageData.latestStats['owner/repo-a'].clones, 7);
assert.deepEqual(storageData.latestStats['owner/repo-a'].referrers, [{ referrer: 'example.test', count: 3, uniques: 2 }]);
assert.equal(storageData.latestStats['owner/repo-a'].trafficFetchedAt, 'traffic-new');

resetState();
storageData.latestStats = {
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
};
await assert.rejects(mutateLatestStats(async () => {
  throw new Error('mutation failed');
}), /mutation failed/);
await mergeLatestStats({
  'owner/repo-a': { repository: 'owner/repo-a', stars: 9, forks: 1, subscribers: 1, fetchedAt: 'new-a' },
});
assert.equal(storageData.latestStats['owner/repo-a'].stars, 9);

resetState();
await mergeLatestStats({
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
});
storageSetCount = 0;
const noOpResult = await mergeLatestStats({
  'owner/repo-a': storageData.latestStats['owner/repo-a'],
});
assert.equal(noOpResult['owner/repo-a'].stars, 1);
assert.equal(storageSetCount, 0);

resetState();
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: false },
};
storageData.lastBackgroundCheckAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
storageGetError = new Error('admission storage failed');
storageGetErrorKey = 'refreshOperationState';
await assert.rejects(__refreshCoordinationTest.scheduleBackgroundCheckAlarm({ catchUpIfDue: true }), /admission storage failed/);
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 30, periodInMinutes: 30 });

resetState();
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: false },
};
storageData.lastBackgroundCheckAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
__refreshCoordinationTest.setBackgroundCheckForTest(async () => {
  throw new Error('background check failed');
});
await assert.rejects(__refreshCoordinationTest.scheduleBackgroundCheckAlarm({ catchUpIfDue: true }), /background check failed/);
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 30, periodInMinutes: 30 });

resetState();
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: false },
};
storageData.lastBackgroundCheckAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
__refreshCoordinationTest.setBackgroundCheckForTest(async () => ({ fetchedAt: new Date().toISOString() }));
await __refreshCoordinationTest.scheduleBackgroundCheckAlarm({ catchUpIfDue: true });
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 30, periodInMinutes: 30 });

resetState();
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: false },
};
storageData.lastBackgroundCheckAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
__refreshCoordinationTest.setBackgroundCheckForTest(async () => ({ skipped: true, reason: 'manual-quiet-window', retryAfterMs: 45000 }));
await __refreshCoordinationTest.scheduleBackgroundCheckAlarm({ catchUpIfDue: true });
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 30, periodInMinutes: 30 });
assert.deepEqual(alarms.get(BACKGROUND_CHECK_RETRY_ALARM_NAME), { delayInMinutes: 0.75 });
assert.equal(Array.from(alarms.keys()).filter((name) => name === BACKGROUND_CHECK_RETRY_ALARM_NAME).length, 1);

resetState();
let versionFetchCalls = 0;
globalThis.fetch = async () => {
  versionFetchCalls += 1;
  return { ok: false, status: 500, headers: { get: () => null }, json: async () => ({}) };
};
storageData.versionCheckStatus = { checkedAt: '', localVersion: '3.1.1', latestVersion: '3.1.2', updateAvailable: true, latestReleaseUrl: '', error: '' };
storageData.githubActivityStatus = {};
await __refreshCoordinationTest.attemptVersionCheck();
assert.equal(versionFetchCalls, 3);
assert.deepEqual(alarms.get('githubRepoStatsMonitorVersionCheck.retry'), { delayInMinutes: 5 });
assert.equal(storageData.versionCheckRetryState.attempts, 1);

storageData.githubActivityStatus = {};
await __refreshCoordinationTest.attemptVersionCheck();
assert.equal(storageData.versionCheckRetryState.attempts, 2);
assert.deepEqual(alarms.get('githubRepoStatsMonitorVersionCheck.retry'), { delayInMinutes: 5 }, 'failed version check retry alarm is replaced, not duplicated');
assert.equal(Array.from(alarms.keys()).filter((name) => name === 'githubRepoStatsMonitorVersionCheck.retry').length, 1);

storageData.githubActivityStatus = {};
await __refreshCoordinationTest.attemptVersionCheck();
assert.equal(storageData.versionCheckRetryState.attempts, 0, 'retry state clears after exhaustion');
assert.equal(alarms.has('githubRepoStatsMonitorVersionCheck.retry'), false, 'retry alarm clears after exhaustion');

resetState();
versionFetchCalls = 0;
globalThis.fetch = async () => {
  versionFetchCalls += 1;
  return { ok: true, json: async () => ({ content: btoa(JSON.stringify({ version: '3.1.2' })) }) };
};
storageData.versionCheckStatus = { checkedAt: '', localVersion: '3.1.1', latestVersion: '', updateAvailable: false, latestReleaseUrl: '', error: '' };
storageData.versionCheckRetryState = { attempts: 2 };
alarms.set('githubRepoStatsMonitorVersionCheck.retry', { delayInMinutes: 5 });
storageData.githubActivityStatus = {};
await __refreshCoordinationTest.attemptVersionCheck();
assert.equal(storageData.versionCheckRetryState.attempts, 0, 'successful version check resets retry state');
assert.equal(alarms.has('githubRepoStatsMonitorVersionCheck.retry'), false, 'successful version check clears retry alarm');

resetState();
const RealDate = Date;
let fakeNow = RealDate.parse('2026-07-10T10:00:00.000Z');
globalThis.Date = class extends RealDate {
  constructor(...args) {
    return args.length === 0 ? new RealDate(fakeNow) : new RealDate(...args);
  }
  static now() { return fakeNow; }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};
storageData.githubToken = 'token';
storageData.repositories = ['owner/repo'];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: true,
  checkIntervalMinutes: 30,
  trackedStats: { stars: true, forks: false, repoWatchers: false, accountFollowers: true },
};
storageData.notificationBaselines = {
  initialized: true,
  account: { login: 'owner', followers: 1, updatedAt: 'old-account' },
  repositories: { 'owner/repo': { repository: 'owner/repo', stars: 1, updatedAt: 'old-repo' } },
  updatedAt: 'old',
};
globalThis.fetch = async (url) => {
  const value = String(url);
  if (value.endsWith('/user')) {
    fakeNow = RealDate.parse('2026-07-10T10:00:05.000Z');
    return { ok: true, headers: { get: () => null }, json: async () => ({ login: 'owner', followers: 2 }) };
  }
  fakeNow = RealDate.parse('2026-07-10T10:00:09.000Z');
  if (value.includes('/traffic/views')) return { ok: true, headers: { get: () => null }, json: async () => ({ count: 10, uniques: 5, views: [] }) };
  if (value.includes('/traffic/clones')) return { ok: true, headers: { get: () => null }, json: async () => ({ count: 4, uniques: 2, clones: [] }) };
  if (value.includes('/traffic/popular/referrers')) return { ok: true, headers: { get: () => null }, json: async () => [] };
  return { ok: true, headers: { get: () => null }, json: async () => ({ stargazers_count: 3, forks_count: 0, subscribers_count: 0 }) };
};
onStorageSet = (values) => {
  if (values.notificationBaselines) fakeNow = RealDate.parse('2026-07-10T10:00:10.000Z');
  if (values.pendingActivity) fakeNow = RealDate.parse('2026-07-10T10:00:11.000Z');
};
const originalSetBadgeText = chrome.action.setBadgeText;
const originalNotificationCreate = chrome.notifications.create;
chrome.action.setBadgeText = () => { fakeNow = RealDate.parse('2026-07-10T10:00:12.000Z'); return Promise.resolve(); };
chrome.notifications.create = (id, options, callback) => { fakeNow = RealDate.parse('2026-07-10T10:00:13.000Z'); callback?.(); return Promise.resolve(); };
const backgroundResult = await __refreshCoordinationTest.runBackgroundCheck();
chrome.action.setBadgeText = originalSetBadgeText;
chrome.notifications.create = originalNotificationCreate;
globalThis.Date = RealDate;
assert.equal(backgroundResult.skipped, false);
assert.equal(storageData.accountStats.fetchedAt, '2026-07-10T10:00:09.000Z', 'automatic account timestamp uses request completion');
assert.equal(storageData.latestStats['owner/repo'].fetchedAt, '2026-07-10T10:00:09.000Z', 'automatic repository timestamp uses metadata completion');
assert.equal(storageData.notificationBaselines.account.updatedAt, '2026-07-10T10:00:09.000Z');
assert.equal(storageData.notificationBaselines.repositories['owner/repo'].updatedAt, '2026-07-10T10:00:09.000Z');
assert.equal(storageData.notificationBaselines.updatedAt, '2026-07-10T10:00:09.000Z', 'overall baselines updatedAt uses latest endpoint completion, not check start');
assert.equal(storageData.lastBackgroundCheckAt, '2026-07-10T10:00:13.000Z', 'background completion is after baseline, pending, badge, and notification work');
assert.equal(backgroundResult.fetchedAt, storageData.lastBackgroundCheckAt, 'returned background fetchedAt equals final completion timestamp');

function configureRefreshRegressionState() {
  storageData.githubToken = 'token';
  storageData.repositories = ['owner/repo'];
  storageData.notifications = {
    backgroundChecksEnabled: true,
    systemNotificationsEnabled: true,
    badgeEnabled: false,
    checkIntervalMinutes: 30,
    trackedStats: { stars: true, forks: true, repoWatchers: true, accountFollowers: true },
  };
  storageData.notificationBaselines = { initialized: false, account: {}, repositories: {}, updatedAt: '' };
}

function installRefreshEndpointMocks() {
  fetchCalls = [];
  api.__resetGitHubRequestLimiterForTest();
  globalThis.fetch = async (url) => {
    const value = String(url);
    fetchCalls.push(value);
    if (value.endsWith('/user')) return { ok: true, headers: { get: () => null }, json: async () => ({ login: 'owner', followers: 2 }) };
    if (value.includes('/traffic/views')) return { ok: true, headers: { get: () => null }, json: async () => ({ count: 10, uniques: 5, views: [] }) };
    if (value.includes('/traffic/clones')) return { ok: true, headers: { get: () => null }, json: async () => ({ count: 4, uniques: 2, clones: [] }) };
    if (value.includes('/traffic/popular/referrers')) return { ok: true, headers: { get: () => null }, json: async () => ([]) };
    return { ok: true, headers: { get: () => null }, json: async () => ({ stargazers_count: 3, forks_count: 1, subscribers_count: 2 }) };
  };
}

function assertAllTrafficEndpointsRequested(message) {
  assert.equal(fetchCalls.some((url) => url.includes('/traffic/views')), true, `${message}: views`);
  assert.equal(fetchCalls.some((url) => url.includes('/traffic/clones')), true, `${message}: clones`);
  assert.equal(fetchCalls.some((url) => url.includes('/traffic/popular/referrers')), true, `${message}: referrers`);
}

resetState();
configureRefreshRegressionState();
installRefreshEndpointMocks();
const fullBackgroundCheck = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(fullBackgroundCheck.skipped, false);
assertAllTrafficEndpointsRequested('background full refresh requests traffic');
assert.equal(fetchCalls.some((url) => url.endsWith('/user')), true, 'background full refresh requests the authenticated account');
assert.equal(storageData.latestStats['owner/repo'].views, 10);
assert.equal(storageData.latestStats['owner/repo'].clones, 4);
assert.deepEqual(storageData.latestStats['owner/repo'].referrers, []);
for (const timestampField of ['fetchedAt', 'trafficFetchedAt', 'clonesFetchedAt', 'referrersFetchedAt']) {
  assert.ok(storageData.latestStats['owner/repo'][timestampField], `background full refresh saves ${timestampField}`);
}
assert.ok(storageData.fullRefreshCoordination?.lastCompletedAt, 'successful background check establishes full-refresh freshness');
assert.equal(storageData.githubActivityStatus.lastFinishedSource, 'background', 'background requests retain GitHub activity tracking');
fetchCalls = [];
const manualAfterBackground = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(manualAfterBackground.reason, 'completed-recently');
assert.equal(fetchCalls.length, 0, 'manual full refresh safely reuses a complete recent background refresh');
const repeatedFullRefresh = await __refreshCoordinationTest.executeFullRefresh('quick-summary');
assert.equal(repeatedFullRefresh.skipped, true, 'genuine full-refresh freshness is still reused');
assert.equal(repeatedFullRefresh.reason, 'completed-recently');
assert.equal(repeatedFullRefresh.source, 'background');

resetState();
configureRefreshRegressionState();
installRefreshEndpointMocks();
await __refreshCoordinationTest.runBackgroundCheck();
fetchCalls = [];
const repositoryAfterBackground = await __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
assert.equal(repositoryAfterBackground.reason, 'completed-recently');
assert.equal(fetchCalls.length, 0, 'repository refresh reuses a complete recent background refresh');

resetState();
configureRefreshRegressionState();
installRefreshEndpointMocks();
const activeBackground = await __refreshCoordinationTest.beginRefreshOperation({ type: 'background', source: 'background' });
assert.equal(activeBackground.admitted, true);
const manualDuringBackground = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(manualDuringBackground.skipped, true);
assert.equal(manualDuringBackground.reason, 'running');
assert.equal(fetchCalls.length, 0, 'manual refresh does not overlap an active background operation');
await __refreshCoordinationTest.finishRefreshOperation(activeBackground.operation);
const manualAfterActiveBackground = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.notEqual(manualAfterActiveBackground.reason, 'completed-recently');
assertAllTrafficEndpointsRequested('manual refresh runs as soon as active background operation finishes');

resetState();
configureRefreshRegressionState();
const oldBackgroundCheckAt = '2026-01-01T00:00:00.000Z';
const oldViewsAt = '2026-01-01T01:00:00.000Z';
storageData.lastBackgroundCheckAt = oldBackgroundCheckAt;
storageData.latestStats = {
  'owner/repo': {
    repository: 'owner/repo', stars: 1, forks: 1, subscribers: 1,
    views: 8, uniqueVisitors: 4, trafficFetchedAt: oldViewsAt,
    clones: 2, clonesFetchedAt: oldViewsAt,
    referrers: [{ referrer: 'cached.example', count: 1, uniques: 1 }], referrersFetchedAt: oldViewsAt,
  },
};
installRefreshEndpointMocks();
const successfulFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  if (String(url).includes('/traffic/views')) {
    fetchCalls.push(String(url));
    return { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'views unavailable' }) };
  }
  return successfulFetch(url);
};
const partialBackground = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(partialBackground.complete, false, 'a failed required endpoint makes the automatic refresh partial');
assert.equal(storageData.latestStats['owner/repo'].views, 8, 'partial background refresh preserves cached traffic');
assert.equal(storageData.latestStats['owner/repo'].trafficFetchedAt, oldViewsAt, 'partial background refresh preserves the successful traffic timestamp');
assert.ok(storageData.latestStats['owner/repo'].trafficError, 'partial background refresh retains the endpoint error');
assert.notEqual(storageData.latestStats['owner/repo'].clonesFetchedAt, oldViewsAt, 'other successful endpoint timestamps advance');
assert.equal(storageData.lastBackgroundCheckAt, oldBackgroundCheckAt, 'partial background refresh does not advance the successful background timestamp');
assert.equal(storageData.fullRefreshCoordination.lastCompletedAt || '', '', 'partial background refresh does not establish reusable freshness');

installRefreshEndpointMocks();
const retryAfterPartialBackground = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(retryAfterPartialBackground.skipped, undefined, 'manual refresh immediately retries after partial background work');
assertAllTrafficEndpointsRequested('manual retry after partial background refresh');
assert.equal(storageData.lastBackgroundCheckAt, oldBackgroundCheckAt, 'manual refresh does not advance the dedicated background timestamp');

resetState();
configureRefreshRegressionState();
storageData.quickSummaryStatus = { manualRefreshAt: '2025-12-31T00:00:00.000Z' };
installRefreshEndpointMocks();
const successfulManualFetch = globalThis.fetch;
globalThis.fetch = async (url) => String(url).includes('/traffic/clones')
  ? (fetchCalls.push(String(url)), { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'clones unavailable' }) })
  : successfulManualFetch(url);
const partialManual = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(partialManual.complete, false);
assert.equal(storageData.quickSummaryStatus.manualRefreshAt, '2025-12-31T00:00:00.000Z', 'partial manual refresh preserves the last successful full manual timestamp');
assert.equal(storageData.fullRefreshCoordination.lastCompletedAt || '', '', 'partial manual refresh is not reusable');
installRefreshEndpointMocks();
const successfulManualRetry = await __refreshCoordinationTest.executeFullRefresh('quick-summary');
assert.equal(successfulManualRetry.complete, true, 'manual retry executes immediately after a partial full refresh');
assert.notEqual(storageData.quickSummaryStatus.manualRefreshAt, '2025-12-31T00:00:00.000Z', 'successful full manual refresh advances its timestamp');

const manualTimestamp = storageData.quickSummaryStatus.manualRefreshAt;
storageData.fullRefreshCoordination.lastCompletedAt = '';
storageData.fullRefreshCoordination.lastManualRequestCompletedAt = '';
installRefreshEndpointMocks();
await __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
assert.equal(storageData.quickSummaryStatus.manualRefreshAt, manualTimestamp, 'per-repository refresh does not advance the global manual timestamp');

resetState();
storageGetError = new Error('settings read failed');
storageGetErrorKey = 'githubToken';
const failedSettingsBackground = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(failedSettingsBackground.complete, false, 'settings read failure returns an explicitly incomplete result');
assert.equal(storageData.fullRefreshCoordination.lastCompletedAt || '', '', 'settings read failure cannot establish reusable freshness');
assert.equal(storageData.lastBackgroundCheckAt, undefined, 'settings read failure cannot establish a successful background timestamp');
storageGetError = null;
storageGetErrorKey = null;
configureRefreshRegressionState();
installRefreshEndpointMocks();
const manualAfterSettingsFailure = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.notEqual(manualAfterSettingsFailure.reason, 'completed-recently', 'manual refresh runs after failed background settings read');
assertAllTrafficEndpointsRequested('manual refresh after settings read failure');

resetState();
configureRefreshRegressionState();
installRefreshEndpointMocks();
await __refreshCoordinationTest.runBackgroundCheck();
const preexistingSuccessfulCompletion = storageData.fullRefreshCoordination.lastCompletedAt;
assert.ok(preexistingSuccessfulCompletion, 'test starts with recent reusable full freshness');
storageData.githubActivityStatus = {};
const completeFetchBeforePartial = globalThis.fetch;
globalThis.fetch = async (url) => String(url).includes('/traffic/views')
  ? (fetchCalls.push(String(url)), { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'views unavailable' }) })
  : completeFetchBeforePartial(url);
const newerPartialBackground = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(newerPartialBackground.complete, false);
assert.equal(storageData.fullRefreshCoordination.lastCompletedAt, '', 'newer partial full refresh invalidates earlier reusable freshness');
installRefreshEndpointMocks();
const manualAfterNewerPartial = await __refreshCoordinationTest.executeFullRefresh('quick-summary');
assert.notEqual(manualAfterNewerPartial.reason, 'completed-recently');
assertAllTrafficEndpointsRequested('manual refresh retries endpoint after newer partial invalidates older success');

resetState();
configureRefreshRegressionState();
storageData.repositories = ['owner/repo', 'owner/other'];
installRefreshEndpointMocks();
await __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
assert.ok(storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/repo'], 'successful repository refresh records reusable completion');
storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/other'] = {
  repository: 'owner/other', source: 'dashboard-repository', completedAt: new Date().toISOString(),
};
const repositorySuccessFetch = globalThis.fetch;
globalThis.fetch = async (url) => String(url).includes('/repos/owner/repo/traffic/clones')
  ? (fetchCalls.push(String(url)), { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'clones unavailable' }) })
  : repositorySuccessFetch(url);
await __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
assert.equal(storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/repo'], undefined, 'partial repository refresh removes its older reusable completion');
assert.ok(storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/other'], 'partial repository refresh preserves unrelated completion entries');
installRefreshEndpointMocks();
const fullAfterPartialRepository = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(fullAfterPartialRepository.skippedRepositories.includes('owner/repo'), false);
assert.equal(fetchCalls.some((url) => url.includes('/repos/owner/repo/traffic/clones')), true, 'full refresh retries repository traffic after partial repository refresh');

resetState();
configureRefreshRegressionState();
installRefreshEndpointMocks();
await __refreshCoordinationTest.executeRepositoryRefresh('owner/repo');
const repositoryCompletionBeforeBackground = storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/repo'];
assert.ok(repositoryCompletionBeforeBackground, 'cross-operation test starts with recent repository-specific freshness');
const cachedTrafficTimestampBeforeBackground = storageData.latestStats['owner/repo'].trafficFetchedAt;
storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/other'] = {
  repository: 'owner/other', source: 'dashboard-repository', completedAt: new Date().toISOString(),
};
storageData.githubActivityStatus = {};
const completeRepositoryFetch = globalThis.fetch;
globalThis.fetch = async (url) => String(url).includes('/repos/owner/repo/traffic/views')
  ? (fetchCalls.push(String(url)), { ok: false, status: 404, headers: { get: () => null }, json: async () => ({ message: 'views unavailable' }) })
  : completeRepositoryFetch(url);
const partialBackgroundAfterRepositorySuccess = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(partialBackgroundAfterRepositorySuccess.complete, false, 'newer background endpoint failure makes the full refresh partial');
assert.equal(storageData.latestStats['owner/repo'].views, 10, 'newer background failure preserves cached repository views');
assert.equal(storageData.latestStats['owner/repo'].trafficFetchedAt, cachedTrafficTimestampBeforeBackground, 'newer background failure preserves the prior traffic timestamp');
assert.ok(storageData.latestStats['owner/repo'].trafficError, 'newer background failure preserves its endpoint error');
assert.equal(storageData.fullRefreshCoordination.lastCompletedAt, '', 'newer partial background keeps global freshness invalid');
assert.equal(storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/repo'], undefined, 'newer partial background invalidates older repository-specific freshness');
assert.ok(storageData.fullRefreshCoordination.completedRepositoryRefreshes['owner/other'], 'newer partial background preserves unrelated repository freshness');
assert.equal(storageData.fullRefreshCoordination.lastRepositoryRequestCompletedRepository, '', 'legacy repository freshness cannot resurrect the failed repository');
installRefreshEndpointMocks();
const manualAfterCrossOperationFailure = await __refreshCoordinationTest.executeFullRefresh('dashboard');
assert.equal(manualAfterCrossOperationFailure.skippedRepositories.includes('owner/repo'), false, 'manual retry does not skip the repository with newer failure evidence');
assert.equal(fetchCalls.some((url) => url.endsWith('/repos/owner/repo')), true, 'manual retry requests repository metadata');
assertAllTrafficEndpointsRequested('manual retry after cross-operation repository invalidation');

resetState();
storageData.githubToken = 'token';
storageData.repositories = [];
storageData.notifications = {
  backgroundChecksEnabled: true,
  systemNotificationsEnabled: true,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
  trackedStats: { stars: false, forks: false, repoWatchers: false, accountFollowers: true },
};
storageData.notificationBaselines = { initialized: false, account: {}, repositories: {}, updatedAt: '' };
api.__resetGitHubRequestLimiterForTest();
fetchCalls = [];
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  assert.equal(String(url), 'https://api.github.com/user');
  return { ok: true, headers: { get: () => null }, json: async () => ({ login: 'owner', followers: 5 }) };
};
const accountOnlyBackground = await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(accountOnlyBackground.complete, true, 'account-only automatic refresh is complete for an empty repository configuration');
assert.deepEqual(fetchCalls, ['https://api.github.com/user']);
assert.equal(storageData.accountStats.followers, 5);
assert.equal(storageData.notificationBaselines.account.followers, 5);
assert.ok(storageData.lastBackgroundCheckAt, 'account-only success advances the dedicated background timestamp');

resetState();
configureRefreshRegressionState();
storageData.notifications.badgeEnabled = true;
storageData.latestStats = {
  'owner/repo': {
    repository: 'owner/repo', stars: 3, forks: 1, subscribers: 2,
    views: 1, uniqueVisitors: 1, clones: 1,
    referrers: [{ referrer: 'old.example', count: 1, uniques: 1 }],
    fetchedAt: 'old', trafficFetchedAt: 'old', clonesFetchedAt: 'old', referrersFetchedAt: 'old',
  },
};
storageData.accountStats = { login: 'owner', followers: 2, fetchedAt: 'old' };
storageData.notificationBaselines = {
  initialized: true,
  account: { login: 'owner', followers: 2, updatedAt: 'old' },
  repositories: { 'owner/repo': { repository: 'owner/repo', stars: 3, forks: 1, repoWatchers: 2, updatedAt: 'old' } },
  updatedAt: 'old',
};
installRefreshEndpointMocks();
const trafficMock = globalThis.fetch;
globalThis.fetch = async (url) => String(url).includes('/traffic/popular/referrers')
  ? (fetchCalls.push(String(url)), { ok: true, headers: { get: () => null }, json: async () => [{ referrer: 'new.example', count: 9, uniques: 4 }] })
  : trafficMock(url);
await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(storageData.latestStats['owner/repo'].views, 10, 'changed views are saved');
assert.equal(storageData.latestStats['owner/repo'].clones, 4, 'changed clones are saved');
assert.deepEqual(storageData.latestStats['owner/repo'].referrers, [{ referrer: 'new.example', count: 9, uniques: 4 }], 'changed referrers are saved');
assert.equal(notificationCalls.length, 0, 'traffic-only changes create no system notification');
assert.equal(storageData.pendingActivity, undefined, 'traffic-only changes create no Quick Summary or Dashboard activity');
assert.equal(badgeTextCalls.length, 0, 'traffic-only changes create no badge activity');
