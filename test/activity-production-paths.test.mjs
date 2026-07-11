import assert from 'node:assert/strict';

const storageData = {};
const badgeTexts = [];
let onChangedCallback = null;

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function resetStorage() {
  Object.keys(storageData).forEach((key) => delete storageData[key]);
  badgeTexts.length = 0;
}

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.1' }),
    getURL: (path) => path,
    lastError: null,
    onInstalled: { addListener() {} },
    onStartup: { addListener() {} },
    onMessage: { addListener(listener) { globalThis.__messageListener = listener; } },
    sendMessage: (message) => new Promise((resolve) => {
      const handled = globalThis.__messageListener?.(message, {}, resolve);
      if (!handled) resolve(undefined);
    }),
  },
  storage: {
    local: {
      get(defaults, callback) {
        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
          if (Object.hasOwn(storageData, key)) result[key] = clone(storageData[key]);
        });
        callback(result);
      },
      set(values, callback) {
        Object.entries(values).forEach(([key, value]) => {
          storageData[key] = clone(value);
        });
        callback?.();
      },
      clear(callback) {
        resetStorage();
        callback?.();
      },
    },
    onChanged: { addListener(listener) { onChangedCallback = listener; } },
  },
  alarms: {
    create: () => Promise.resolve(),
    clear: () => Promise.resolve(true),
    onAlarm: { addListener() {} },
  },
  action: {
    setBadgeText: ({ text }) => { badgeTexts.push(text); return Promise.resolve(); },
    setBadgeBackgroundColor: () => Promise.resolve(),
  },
  notifications: { create: (id, options, callback) => { callback?.(); return Promise.resolve(); } },
};

globalThis.fetch = async () => ({ ok: true, json: async () => ({}) });

const {
  __backgroundGitHubMessageTest,
} = await import('../src/background.js');
const { createEmptyPendingActivity, recordRepositoryActivityDelta, recordAccountActivityDelta } = await import('../src/shared/activity.js');

function repoActivity(delta = 1) {
  const pendingActivity = createEmptyPendingActivity();
  recordRepositoryActivityDelta(pendingActivity, 'owner/repo', 'starsDelta', delta, 'Star', null, 't1');
  return pendingActivity;
}

async function claim(surface) {
  return __backgroundGitHubMessageTest.claimActivityDelivery(surface);
}

async function ack(surface, token, displayedActivity, displayedReview = {}) {
  return __backgroundGitHubMessageTest.acknowledgeActivityDelivery(surface, token, displayedActivity, displayedReview);
}

resetStorage();
storageData.pendingActivity = repoActivity(1);
storageData.pendingActivity.badgeActivity = { account: false, repositories: { 'owner/repo': true }, updatedAt: 'badge' };
const quickClaim = await claim('quick-summary');
assert.equal(quickClaim.activity.repositories['owner/repo'].starsDelta, 1, 'initial Quick Summary claim returns queued activity');
await ack('quick-summary', quickClaim.token, { repositories: { 'owner/repo': { starsDelta: 1 } } });
await __backgroundGitHubMessageTest.applyManualRefreshPendingActivity({
  detectedChanges: { account: [], repositories: { 'owner/repo': [{ delta: 2, label: 'Star' }] } },
  checkedAt: 'manual-refresh',
  includeBadgeActivity: false,
});
assert.equal(storageData.pendingActivity.quickSummary.inFlight, null, 'acknowledgement remains applied after producer mutation');
assert.equal(storageData.pendingActivity.quickSummary.queued.repositories['owner/repo'].starsDelta, 2, 'new manual refresh activity remains queued');
assert.equal(storageData.pendingActivity.dashboard.queued.repositories['owner/repo'].starsDelta, 3, 'dashboard keeps combined unacknowledged activity');

resetStorage();
storageData.pendingActivity = repoActivity(1);
const dashboardClaim = await claim('dashboard');
await ack('dashboard', dashboardClaim.token, { repositories: { 'owner/repo': { starsDelta: 1 } } });
await __backgroundGitHubMessageTest.applyManualRefreshPendingActivity({
  detectedChanges: { account: [], repositories: { 'owner/repo': [{ delta: 4, label: 'Star' }] } },
  checkedAt: 'repo-refresh',
  includeBadgeActivity: false,
});
assert.equal(storageData.pendingActivity.dashboard.inFlight, null, 'Dashboard acknowledgement survives repository producer mutation');
assert.equal(storageData.pendingActivity.dashboard.queued.repositories['owner/repo'].starsDelta, 4, 'new repository refresh activity remains queued for Dashboard');
assert.equal(storageData.pendingActivity.quickSummary.queued.repositories['owner/repo'].starsDelta, 5, 'Quick Summary preserves prior queued plus new repository activity');

resetStorage();
storageData.pendingActivity = repoActivity(2);
const beforeInvalid = clone(storageData.pendingActivity);
await assert.rejects(__backgroundGitHubMessageTest.claimActivityDelivery('invalid-surface'), /Invalid activity surface/);
assert.deepEqual(storageData.pendingActivity, beforeInvalid, 'invalid claim surface does not modify storage');

resetStorage();
storageData.pendingActivity = repoActivity(3);
const queuedOnly = clone(storageData.pendingActivity.dashboard.queued);
assert.equal(storageData.pendingActivity.dashboard.inFlight, null);
assert.equal(queuedOnly.repositories['owner/repo'].starsDelta, 3, 'queued activity remains stored before claim');

resetStorage();
storageData.pendingActivity = createEmptyPendingActivity();
recordRepositoryActivityDelta(storageData.pendingActivity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
recordRepositoryActivityDelta(storageData.pendingActivity, 'owner/keep', 'forksDelta', 2, 'Fork', null, 't1');
await claim('quick-summary');
await claim('dashboard');
storageData.viewedBaselines = {
  quickSummary: { account: {}, repositories: { 'owner/repo': { repository: 'owner/repo', stars: 1 }, 'owner/keep': { repository: 'owner/keep', forks: 2 } } },
  dashboard: { account: {}, repositories: { 'owner/repo': { repository: 'owner/repo', stars: 1 }, 'owner/keep': { repository: 'owner/keep', forks: 2 } } },
};
storageData.pendingActivity.badgeActivity = { account: false, repositories: { 'owner/repo': true, 'owner/keep': true }, updatedAt: 'badge' };
storageData.repositories = ['owner/keep'];
await __backgroundGitHubMessageTest.cleanupRemovedRepositoryStorage(['owner/keep']);
assert.equal(storageData.pendingActivity.quickSummary.inFlight.repositories['owner/repo'], undefined);
assert.equal(storageData.pendingActivity.dashboard.inFlight.repositories['owner/repo'], undefined);
assert.equal(storageData.pendingActivity.quickSummary.inFlight.repositories['owner/keep'].forksDelta, 2);
assert.equal(storageData.viewedBaselines.quickSummary.repositories['owner/repo'], undefined);
assert.equal(storageData.viewedBaselines.dashboard.repositories['owner/repo'], undefined);
assert.equal(storageData.viewedBaselines.quickSummary.repositories['owner/keep'].forks, 2);
assert.equal(storageData.pendingActivity.badgeActivity.repositories['owner/repo'], undefined);
assert.equal(storageData.pendingActivity.badgeActivity.repositories['owner/keep'], true);

resetStorage();
storageData.pendingActivity = createEmptyPendingActivity();
recordAccountActivityDelta(storageData.pendingActivity, 5, null, 't1');
recordRepositoryActivityDelta(storageData.pendingActivity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't1');
await claim('quick-summary');
await claim('dashboard');
storageData.pendingActivity.badgeActivity = { account: true, repositories: { 'owner/repo': true }, updatedAt: 'badge' };
storageData.viewedBaselines = {
  quickSummary: { account: { login: 'me', followers: 5 }, repositories: { 'owner/repo': { repository: 'owner/repo', stars: 2 } } },
  dashboard: { account: { login: 'me', followers: 6 }, repositories: { 'owner/repo': { repository: 'owner/repo', stars: 3 } } },
};
await __backgroundGitHubMessageTest.resetAccountStateForTokenChange();
assert.deepEqual(storageData.pendingActivity.quickSummary.inFlight.account, {});
assert.deepEqual(storageData.pendingActivity.dashboard.inFlight.account, {});
assert.equal(storageData.pendingActivity.quickSummary.inFlight.repositories['owner/repo'].starsDelta, 2);
assert.equal(storageData.pendingActivity.badgeActivity.account, false);
assert.equal(storageData.pendingActivity.badgeActivity.repositories['owner/repo'], true);
assert.deepEqual(storageData.viewedBaselines.quickSummary.account, {});
assert.equal(storageData.viewedBaselines.quickSummary.repositories['owner/repo'].stars, 2);

resetStorage();
storageData.pendingActivity = repoActivity(1);
storageData.pendingActivity.badgeActivity = { account: true, repositories: { 'owner/repo': true }, updatedAt: 'badge' };
await __backgroundGitHubMessageTest.handleNotificationSettingsChange({ newValue: { backgroundChecksEnabled: true, badgeEnabled: false } }, { scheduleAlarm: false });
assert.deepEqual(storageData.pendingActivity.badgeActivity, { account: false, repositories: {}, updatedAt: '' });
assert.equal(storageData.pendingActivity.quickSummary.queued.repositories['owner/repo'].starsDelta, 1);
assert.equal(storageData.pendingActivity.dashboard.queued.repositories['owner/repo'].starsDelta, 1);

resetStorage();
storageData.pendingActivity = createEmptyPendingActivity();
recordAccountActivityDelta(storageData.pendingActivity, 4, null, 't1');
storageData.pendingActivity.badgeActivity = { account: true, repositories: {}, updatedAt: 'badge' };
const accountClaim = await claim('quick-summary');
await ack('quick-summary', accountClaim.token, { account: { followersDelta: 3 } });
assert.equal(storageData.pendingActivity.quickSummary.inFlight.account.followersDelta, 4);
assert.equal(storageData.pendingActivity.badgeActivity.account, true);
await ack('quick-summary', accountClaim.token, { account: { followersDelta: 4 } });
assert.equal(storageData.pendingActivity.quickSummary.inFlight, null);
assert.equal(storageData.pendingActivity.badgeActivity.account, false);

resetStorage();
storageData.pendingActivity = repoActivity(5);
storageData.pendingActivity.badgeActivity = { account: false, repositories: { 'owner/repo': true }, updatedAt: 'badge' };
const metricClaim = await claim('dashboard');
await ack('dashboard', metricClaim.token, { repositories: { 'owner/repo': { starsDelta: 4 } } });
assert.equal(storageData.pendingActivity.dashboard.inFlight.repositories['owner/repo'].starsDelta, 5);
assert.equal(storageData.pendingActivity.badgeActivity.repositories['owner/repo'], true);
await ack('dashboard', metricClaim.token, { repositories: { 'owner/repo': { starsDelta: 5 } } });
assert.equal(storageData.pendingActivity.dashboard.inFlight, null);
assert.equal(storageData.pendingActivity.badgeActivity.repositories['owner/repo'], undefined);

resetStorage();
storageData.pendingActivity = createEmptyPendingActivity();
storageData.viewedBaselines = { quickSummary: { account: {}, repositories: {}, updatedAt: 'old-q' }, dashboard: { account: {}, repositories: {}, updatedAt: 'old-d' }, updatedAt: 'root-old' };
const [quickReview, dashboardReview] = await Promise.all([
  ack('quick-summary', '', {}, { reviewedAt: '2026-01-01T00:00:00.000Z', repositories: { 'owner/repo': { repository: 'owner/repo', stars: 10, forks: 1, repoWatchers: 2 } } }),
  ack('dashboard', '', {}, { reviewedAt: '2026-01-01T00:00:01.000Z', account: { login: 'me', followers: 7 } }),
]);
assert.equal(quickReview.viewedBaselines.quickSummary.repositories['owner/repo'].stars, 10);
assert.equal(dashboardReview.viewedBaselines.dashboard.account.followers, 7);
assert.equal(storageData.viewedBaselines.quickSummary.repositories['owner/repo'].stars, 10);
assert.equal(storageData.viewedBaselines.dashboard.account.followers, 7);
const baselinesBeforeEmpty = clone(storageData.viewedBaselines);
await ack('quick-summary', '', {}, {});
assert.deepEqual(storageData.viewedBaselines, baselinesBeforeEmpty, 'empty review does not update baseline timestamps or values');

resetStorage();
storageData.pendingActivity = repoActivity(1);
const staleClaim = await claim('quick-summary');
storageData.pendingActivity.quickSummary.inFlight.claimedAt = '2026-01-01T00:00:00.000Z';
storageData.pendingActivity.quickSummary.queued.repositories['owner/repo'] = { repository: 'owner/repo', starsDelta: 2 };
const realDateNow = Date.now;
Date.now = () => new Date('2026-01-01T00:11:00.000Z').getTime();
const reclaimed = await claim('quick-summary');
Date.now = realDateNow;
assert.equal(reclaimed.activity.repositories['owner/repo'].starsDelta, 3, 'stale in-flight is merged with newer queued activity');
assert.notEqual(reclaimed.token, staleClaim.token);

resetStorage();
storageData.pendingActivity = repoActivity(1);
const reopenClaim = await claim('dashboard');
await ack('dashboard', reopenClaim.token, { repositories: { 'owner/repo': { starsDelta: 1 } } });
const reopened = await claim('dashboard');
assert.equal(reopened.token, '', 'reopening Dashboard does not repeat acknowledged activity');

console.log('activity production path tests passed');
