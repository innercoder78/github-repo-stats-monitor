import assert from 'node:assert/strict';

const storageData = {};
const notifications = [];
const badgeTexts = [];
let nowIndex = 0;
const times = [
  '2026-02-01T00:00:00.000Z',
  '2026-02-01T00:00:01.000Z',
  '2026-02-01T00:00:02.000Z',
  '2026-02-01T00:00:03.000Z',
  '2026-02-01T00:00:04.000Z',
];
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [times[Math.min(nowIndex++, times.length - 1)]])); }
  static now() { return new RealDate(times[Math.min(nowIndex, times.length - 1)]).getTime(); }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};

function clone(value) { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; }
function reset() { Object.keys(storageData).forEach((key) => delete storageData[key]); notifications.length = 0; badgeTexts.length = 0; nowIndex = 0; }

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
  storage: { local: {
    get(defaults, cb) { const r = { ...defaults }; Object.keys(defaults).forEach((k) => { if (Object.hasOwn(storageData, k)) r[k] = clone(storageData[k]); }); cb(r); },
    set(values, cb) { Object.assign(storageData, clone(values)); cb?.(); },
    clear(cb) { reset(); cb?.(); },
  }, onChanged: { addListener() {} } },
  alarms: { create: () => Promise.resolve(), clear: () => Promise.resolve(true), onAlarm: { addListener() {} } },
  action: { setBadgeText: ({ text }) => { badgeTexts.push(text); return Promise.resolve(); }, setBadgeBackgroundColor: () => Promise.resolve() },
  notifications: { create: (id, options, cb) => { notifications.push({ id, options }); cb?.(); return Promise.resolve(); } },
};

globalThis.fetch = async () => ({ ok: true, json: async () => ({ login: 'me', followers: 1 }), headers: new Headers() });
const { __refreshCoordinationTest } = await import('../src/background.js');
const api = await import('../src/shared/github-api.js');

function setupAccountCheck({ baselineLogin = 'me', baselineFollowers = 1, cachedLogin = baselineLogin, cachedFollowers = baselineFollowers, fetchedLogin = 'me', fetchedFollowers = 2, badgeEnabled = true } = {}) {
  reset();
  api.__resetGitHubRequestLimiterForTest();
  storageData.githubToken = 'token';
  storageData.repositories = ['owner/repo'];
  storageData.accountStats = { login: cachedLogin, followers: cachedFollowers, fetchedAt: 'cached-time' };
  storageData.notificationBaselines = {
    initialized: true,
    account: { login: baselineLogin, followers: baselineFollowers, updatedAt: 'baseline-time' },
    repositories: {},
    updatedAt: 'baseline-time',
  };
  storageData.notifications = {
    backgroundChecksEnabled: true,
    systemNotificationsEnabled: true,
    badgeEnabled,
    checkIntervalMinutes: 30,
    trackedStats: { stars: false, forks: false, repoWatchers: false, accountFollowers: true },
  };
  globalThis.fetch = async (url) => {
    assert.equal(String(url), 'https://api.github.com/user');
    return { ok: true, json: async () => ({ login: fetchedLogin, followers: fetchedFollowers }), headers: new Headers() };
  };
}

setupAccountCheck({ baselineFollowers: 1, fetchedFollowers: 3 });
await __refreshCoordinationTest.runBackgroundCheck();
const accountCompletedAt = storageData.accountStats.fetchedAt;
assert.match(accountCompletedAt, /^2026-02-01T00:00:0[0-9]\.000Z$/, 'background account cache uses an endpoint completion timestamp');
assert.equal(storageData.notificationBaselines.account.updatedAt, accountCompletedAt);
assert.equal(storageData.pendingActivity.quickSummary.queued.account.followersDelta, 2);
assert.equal(storageData.pendingActivity.quickSummary.queued.updatedAt, accountCompletedAt, 'Quick Summary background account activity uses endpoint timestamp');
assert.equal(storageData.pendingActivity.dashboard.queued.account.followersDelta, 2);
assert.equal(storageData.pendingActivity.dashboard.queued.updatedAt, accountCompletedAt, 'Dashboard background account activity uses endpoint timestamp');
assert.equal(storageData.pendingActivity.badgeActivity.account, true);
assert.equal(storageData.pendingActivity.badgeActivity.updatedAt, accountCompletedAt);
assert.equal(notifications.length, 1, 'same-login background follower change sends notification');

setupAccountCheck({ baselineLogin: 'old', baselineFollowers: 8, cachedLogin: 'old', cachedFollowers: 8, fetchedLogin: 'new', fetchedFollowers: 20 });
await __refreshCoordinationTest.runBackgroundCheck();
assert.equal(storageData.accountStats.login, 'new', 'background login change updates account cache');
assert.equal(storageData.accountStats.followers, 20);
assert.equal(storageData.notificationBaselines.account.login, 'new', 'background login change updates notification baseline');
assert.equal(storageData.notificationBaselines.account.followers, 20);
assert.equal(storageData.pendingActivity, undefined, 'background login change creates no pending activity');
assert.equal(notifications.length, 0, 'background login change sends no notification');
assert.deepEqual(badgeTexts, [], 'background login change creates no account badge location');
