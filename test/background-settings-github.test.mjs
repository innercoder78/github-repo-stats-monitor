import assert from 'node:assert/strict';

const storageData = {};
const activitySnapshots = [];

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
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
        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
          if (Object.hasOwn(storageData, key)) result[key] = clone(storageData[key]);
        });
        callback(result);
      },
      set(values, callback) {
        if (values.githubActivityStatus) activitySnapshots.push(clone(values.githubActivityStatus));
        Object.assign(storageData, clone(values));
        callback?.();
      },
    },
    onChanged: { addListener() {} },
  },
  alarms: { create: () => Promise.resolve(), clear: () => Promise.resolve(true), onAlarm: { addListener() {} } },
  action: { setBadgeText: () => Promise.resolve(), setBadgeBackgroundColor: () => Promise.resolve() },
  notifications: { create: () => Promise.resolve() },
};

let fetchCalls = [];
globalThis.fetch = async (url) => {
  fetchCalls.push(String(url));
  if (String(url).includes('/user/repos')) {
    const page = new URL(String(url)).searchParams.get('page');
    const repositories = page === '1'
      ? Array.from({ length: 100 }, (_, index) => ({ full_name: `owner/repo-${index}`, visibility: 'public' }))
      : [{ full_name: 'owner/final-repo', visibility: 'private', private: true }];
    return { ok: true, headers: { get: () => '' }, json: async () => repositories };
  }
  return { ok: true, headers: { get: () => '' }, json: async () => ({}) };
};

const {
  __backgroundGitHubMessageTest,
} = await import('../src/background.js');
const { getGitHubRequestLimiterState, __resetGitHubRequestLimiterForTest } = await import('../src/shared/github-api.js');
const { __getGitHubActivityLiveOperationCountForTest } = await import('../src/shared/github-activity.js');

function tick() {
  return new Promise((resolve) => setImmediate(resolve));
}

function sendSettingsMessage(action, payload) {
  return new Promise((resolve) => {
    const handled = __backgroundGitHubMessageTest.handleSettingsGitHubMessage({ action, payload }, resolve);
    assert.equal(handled, true);
  });
}

function countActivityStarts(source) {
  return activitySnapshots.filter((snapshot) => snapshot.active && Object.values(snapshot.activeOperations || {}).some((operation) => operation.source === source)).length;
}

let response = await sendSettingsMessage('settings.github.importRepositories', { token: 'token' });
assert.equal(response.ok, true);
assert.equal(response.result.length, 101, 'multi-page import preserves returned repository data');
assert.equal(fetchCalls.filter((url) => url.includes('/user/repos')).length, 2, 'import follows pagination');
assert.equal(countActivityStarts('repository-import'), 1, 'multi-page import is one high-level operation');
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0);

fetchCalls = [];
activitySnapshots.length = 0;
__resetGitHubRequestLimiterForTest();
let active = 0;
let maxActive = 0;
const pendingFetches = [];
globalThis.fetch = (url) => {
  fetchCalls.push(String(url));
  active += 1;
  maxActive = Math.max(maxActive, active);
  const request = deferred();
  pendingFetches.push(request);
  request.promise.finally(() => { active -= 1; });
  return request.promise;
};
const connectionResponsePromise = sendSettingsMessage('settings.github.testConnection', { token: 'token', repositories: ['Owner/Repoa', 'owner/repob'] });
await tick();
assert.equal(maxActive, 4, 'Test Connection individual requests use the four-request limiter');
assert.equal(getGitHubRequestLimiterState().active, 4);
assert.equal(countActivityStarts('connection-test'), 1, 'Test Connection is one high-level operation');
while (pendingFetches.length > 0) {
  pendingFetches.shift().resolve({ ok: true, headers: { get: () => '' }, json: async () => ({}) });
  await tick();
}
response = await connectionResponsePromise;
assert.equal(response.ok, true);
assert.equal(response.result.length, 2);
await Promise.resolve();
assert.deepEqual(getGitHubRequestLimiterState(), { active: 0, queued: 0 });
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0, 'closed requester cannot leave live activity behind after completion');

assert.throws(() => __backgroundGitHubMessageTest.validateRepositoryListPayload({ repositories: 'owner/repo' }), /array/);
assert.throws(() => __backgroundGitHubMessageTest.validateRepositoryListPayload({ repositories: ['not a repo'] }), /invalid/i);
assert.throws(() => __backgroundGitHubMessageTest.validateRepositoryListPayload({ repositories: ['owner/repo', 'OWNER/REPO'] }), /duplicate/i);
assert.throws(() => __backgroundGitHubMessageTest.validateRepositoryListPayload({ repositories: Array.from({ length: 21 }, (_, index) => `owner/repo-${index}`) }), /20/);
assert.deepEqual(__backgroundGitHubMessageTest.validateRepositoryListPayload({ repositories: ['Owner/Repo'] }), ['owner/repo']);
