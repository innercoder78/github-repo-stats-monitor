import assert from 'node:assert/strict';

const storageData = {};
let fetchCalls = [];
let nowIndex = 0;
const times = [
  '2026-01-01T00:00:00.000Z',
  '2026-01-01T00:00:01.000Z',
  '2026-01-01T00:00:02.000Z',
  '2026-01-01T00:00:03.000Z',
  '2026-01-01T00:00:04.000Z',
];
const RealDate = Date;
globalThis.Date = class extends RealDate {
  constructor(...args) { super(...(args.length ? args : [times[Math.min(nowIndex++, times.length - 1)]])); }
  static now() { return new RealDate(times[Math.min(nowIndex, times.length - 1)]).getTime(); }
  static parse(value) { return RealDate.parse(value); }
  static UTC(...args) { return RealDate.UTC(...args); }
};

function clone(value) { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; }
function reset() { Object.keys(storageData).forEach((key) => delete storageData[key]); fetchCalls = []; nowIndex = 0; }

globalThis.chrome = {
  runtime: { getManifest: () => ({ version: '3.1.1' }), lastError: null },
  storage: { local: {
    get(defaults, cb) { const r = { ...defaults }; Object.keys(defaults).forEach((k) => { if (Object.hasOwn(storageData, k)) r[k] = clone(storageData[k]); }); cb(r); },
    set(values, cb) { Object.assign(storageData, clone(values)); cb?.(); },
  } },
};

const api = await import('../src/shared/github-api.js');
const { refreshStatsCache, syncNotificationBaselinesFromManualRefresh } = await import('../src/shared/refresh-stats.js');
const { createEmptyPendingActivity, detectPendingActivityFromStats } = await import('../src/shared/activity.js');

function response(body, ok = true) { return { ok, json: async () => body, headers: new Headers() }; }

async function fetchAccountPayload(payload) {
  api.__resetGitHubRequestLimiterForTest();
  globalThis.fetch = async (url) => { fetchCalls.push(String(url)); return response(payload); };
  return api.fetchAuthenticatedAccount('token');
}

assert.deepEqual(await fetchAccountPayload({ login: 'me', followers: 0 }), { login: 'me', followers: 0 }, '0 followers is valid');
for (const payload of [
  { followers: 1 },
  { login: ' ', followers: 1 },
  { login: 'me' },
  { login: 'me', followers: -1 },
  { login: 'me', followers: 1.5 },
  { login: 'me', followers: '1' },
  { login: 'me', followers: Infinity },
]) {
  await assert.rejects(fetchAccountPayload(payload), /valid login or follower count/, `rejects ${JSON.stringify(payload)}`);
}

reset();
storageData.fullRefreshCoordination = { completedRepositoryRefreshes: { 'owner/repo': { repository: 'owner/repo', completedAt: '2026-01-01T00:00:00.000Z' } } };
storageData.accountStats = { login: 'old', followers: 1, fetchedAt: 'old-time' };
api.__resetGitHubRequestLimiterForTest();
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  assert.equal(String(url), 'https://api.github.com/user');
  return response({ login: 'me', followers: 2 });
};
let result = await refreshStatsCache(
  { githubToken: 'token', repositories: ['owner/repo'], notifications: { trackedStats: { accountFollowers: true } } },
  { 'owner/repo': { repository: 'owner/repo', stars: 1, forks: 1, subscribers: 1, fetchedAt: 'cached' } },
  { source: 'quick-summary', skipFullRefreshCoordination: true, accountStats: storageData.accountStats },
);
assert.equal(fetchCalls.length, 1, 'all-recent full refresh still calls account once');
assert.equal(result.results.length, 0, 'all-recent full refresh does not call repo endpoints');
assert.equal(result.accountRefreshed, true);
assert.equal(storageData.accountStats.login, 'me');
assert.equal(storageData.accountStats.followers, 2);
assert.equal(storageData.accountStats.fetchedAt, result.accountFetchedAt);

reset();
storageData.accountStats = { login: 'old', followers: 5, fetchedAt: 'old-time' };
storageData.notificationBaselines = { account: { login: 'old', followers: 5, updatedAt: 'baseline-old' }, repositories: {}, updatedAt: 'baseline-old' };
api.__resetGitHubRequestLimiterForTest();
globalThis.fetch = async (url) => { fetchCalls.push(String(url)); return String(url).includes('/user') ? response({ message: 'bad' }, false) : response({ stargazers_count: 1, forks_count: 1, subscribers_count: 1 }); };
result = await refreshStatsCache(
  { githubToken: 'token', repositories: ['owner/repo'], notifications: { trackedStats: { accountFollowers: true } } },
  {},
  { source: 'dashboard', skipFullRefreshCoordination: true, accountStats: storageData.accountStats, detectActivity: true },
);
assert.equal(result.accountRefreshed, false);
assert.deepEqual(result.accountStats, { login: 'old', followers: 5, fetchedAt: 'old-time' }, 'failed account preserves cache');
assert.equal(storageData.notificationBaselines.account.updatedAt, 'baseline-old', 'failed account does not update baseline');
assert.equal(result.pendingActivity, null, 'failed account does not create pending activity');
assert.ok(result.results.length === 1, 'repository work proceeds when account fails');

reset();
const pending = createEmptyPendingActivity();
const settings = { notifications: { trackedStats: { accountFollowers: true }, badgeEnabled: true } };
let changes = { account: [], repositories: {} };
assert.equal(detectPendingActivityFromStats(settings, {}, {}, { login: 'me', followers: 1, fetchedAt: 'old' }, { login: 'me', followers: 3, fetchedAt: 'new' }, pending, 'new', [], changes), true);
assert.equal(pending.quickSummary.queued.account.followersDelta, 2);
assert.equal(pending.dashboard.queued.account.followersDelta, 2);

const pendingDown = createEmptyPendingActivity();
changes = { account: [], repositories: {} };
assert.equal(detectPendingActivityFromStats(settings, {}, {}, { login: 'me', followers: 3, fetchedAt: 'old' }, { login: 'me', followers: 1, fetchedAt: 'new' }, pendingDown, 'new', [], changes), true);
assert.equal(pendingDown.quickSummary.queued.account.followersDelta, -2);
assert.equal(pendingDown.dashboard.queued.account.followersDelta, -2);

const pendingLoginChange = createEmptyPendingActivity();
changes = { account: [], repositories: {} };
assert.equal(detectPendingActivityFromStats(settings, {}, {}, { login: 'old', followers: 1, fetchedAt: 'old' }, { login: 'new', followers: 9, fetchedAt: 'new' }, pendingLoginChange, 'new', [], changes), false);
assert.deepEqual(changes.account, []);

reset();
storageData.notificationBaselines = { account: { login: 'old', followers: 1, updatedAt: 'old-time' }, repositories: {}, updatedAt: 'old-time' };
await syncNotificationBaselinesFromManualRefresh({ accountStats: { login: 'new', followers: 9, fetchedAt: 'new-time' }, accountRefreshed: true, fetchedAt: 'new-time' });
assert.equal(storageData.notificationBaselines.account.login, 'new', 'login change establishes new baseline');
assert.equal(storageData.notificationBaselines.account.updatedAt, 'new-time');
