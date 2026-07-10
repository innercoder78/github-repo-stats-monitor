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
    create: () => Promise.resolve(),
  },
};

globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  return { ok: true, json: async () => ({}) };
};

const {
  BACKGROUND_CHECK_ALARM_NAME,
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
const queuedCleanup = removeUnconfiguredLatestStats(['owner/repo-a']);
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
  'owner/repo-a': { repository: 'owner/repo-a', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'old-a' },
  'owner/repo-b': { repository: 'owner/repo-b', stars: 2, forks: 2, subscribers: 2, fetchedAt: 'old-b' },
};
await removeUnconfiguredLatestStats(['owner/repo-a']);
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
assert.deepEqual(alarms.get(BACKGROUND_CHECK_ALARM_NAME), { delayInMinutes: 0.75, periodInMinutes: 30 });
