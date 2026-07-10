import assert from 'node:assert/strict';

const storageData = {};
const alarms = new Map();
let storageGetError = null;
let storageSetError = null;
let storageGetErrorKey = null;
let fetchCalls = [];
let storageSetCount = 0;

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
    setBadgeText: () => Promise.resolve(),
    setBadgeBackgroundColor: () => Promise.resolve(),
  },
  notifications: {
    create: (id, options, callback) => { callback?.(); return Promise.resolve(); },
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
const { mergeLatestStats, mutateLatestStats, patchLatestStats, removeUnconfiguredLatestStats } = await import('../src/shared/storage.js');

function resetState() {
  Object.keys(storageData).forEach((key) => delete storageData[key]);
  alarms.clear();
  storageGetError = null;
  storageSetError = null;
  storageGetErrorKey = null;
  fetchCalls = [];
  storageSetCount = 0;
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
  releaseFullRefresh = () => resolve({ fetchedAt: new Date().toISOString() });
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
  return { ok: true, headers: { get: () => null }, json: async () => ({ stargazers_count: 3, forks_count: 0, subscribers_count: 0 }) };
};
const backgroundResult = await __refreshCoordinationTest.runBackgroundCheck();
globalThis.Date = RealDate;
assert.equal(backgroundResult.skipped, false);
assert.equal(storageData.accountStats.fetchedAt, '2026-07-10T10:00:05.000Z', 'automatic account timestamp uses account completion');
assert.equal(storageData.latestStats['owner/repo'].fetchedAt, '2026-07-10T10:00:09.000Z', 'automatic repository timestamp uses metadata completion');
assert.equal(storageData.notificationBaselines.account.updatedAt, '2026-07-10T10:00:05.000Z');
assert.equal(storageData.notificationBaselines.repositories['owner/repo'].updatedAt, '2026-07-10T10:00:09.000Z');
assert.equal(storageData.lastBackgroundCheckAt, '2026-07-10T10:00:09.000Z', 'background completion is after endpoint completion');
