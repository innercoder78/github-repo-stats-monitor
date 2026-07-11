import assert from 'node:assert/strict';

const storageWrites = [];
globalThis.chrome = {
  runtime: { getManifest: () => ({ version: '3.1.1' }), getURL: (p) => p, lastError: null, onInstalled: { addListener() {} }, onStartup: { addListener() {} }, onMessage: { addListener() {} }, sendMessage: () => Promise.resolve() },
  storage: { local: { get(defaults, cb) { cb({ ...defaults }); }, set(values, cb) { storageWrites.push(values); cb?.(); } }, onChanged: { addListener() {} } },
  alarms: { create: () => Promise.resolve(), clear: () => Promise.resolve(true), onAlarm: { addListener() {} } },
  action: { setBadgeText: () => Promise.resolve(), setBadgeBackgroundColor: () => Promise.resolve() },
  notifications: { create: () => Promise.resolve() },
};

function response(body, { ok = true, status = 200, link = '' } = {}) {
  return { ok, status, headers: { get: (name) => name.toLowerCase() === 'link' ? link : '' }, json: async () => body };
}

const { __backgroundGitHubMessageTest } = await import('../src/background.js');
const { __resetGitHubRequestLimiterForTest } = await import('../src/shared/github-api.js');

async function executeConnection(repositories = ['owner/repo']) {
  return __backgroundGitHubMessageTest.executeConnectionTest({ token: 'token', repositories });
}

let calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ login: 'octo', followers: 1 });
  return response({});
};
let result = await executeConnection(['owner/a', 'owner/b']);
assert.equal(calls.filter((url) => url.endsWith('/user')).length, 1, 'account endpoint is called exactly once');
assert.equal(result.length, 2);

calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ message: 'bad credentials' }, { ok: false, status: 401 });
  return response({});
};
await assert.rejects(() => executeConnection(['owner/a', 'owner/b']), /GitHub rejected/i);
assert.equal(calls.filter((url) => url.includes('/repos/')).length, 0, 'invalid token makes no repository requests');

calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ login: '', followers: 1 });
  return response({});
};
await assert.rejects(() => executeConnection(['owner/a']), /account response/i);
assert.equal(calls.filter((url) => url.includes('/repos/')).length, 0, 'malformed account response makes no repository requests');

calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ login: 'octo', followers: 1 });
  if (String(url).includes('/repos/owner/fail') && !String(url).includes('/traffic/')) return response({ message: 'not found' }, { ok: false, status: 404 });
  return response({});
};
result = await executeConnection(['owner/fail', 'owner/ok']);
assert.equal(calls.some((url) => url.includes('/repos/owner/fail/traffic/')), false, 'metadata failure gates traffic requests');
assert.deepEqual([result[0].traffic.status, result[0].clones.status, result[0].referrers.status], ['skipped', 'skipped', 'skipped']);
assert.equal(result[1].metadata.ok, true, 'another repository still completes');
assert.deepEqual(result.map((item) => item.repository), ['owner/fail', 'owner/ok'], 'input order is preserved');

calls = [];
storageWrites.length = 0;
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ login: 'octo', followers: 1 });
  if (String(url).includes('/repos/owner/repo')) return response({});
  return response({});
};
await executeConnection(['owner/repo']);
assert.equal(storageWrites.length, 0, 'successful connection test is read-only');

calls = [];
const repos = Array.from({ length: 20 }, (_, i) => `owner/missing-${i}`);
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (String(url).endsWith('/user')) return response({ login: 'octo', followers: 1 });
  return response({ message: 'nope' }, { ok: false, status: 404 });
};
await executeConnection(repos);
assert.equal(calls.filter((url) => url.endsWith('/user')).length, 1);
assert.equal(calls.filter((url) => url.includes('/repos/')).length, 20);

const { fetchAuthenticatedRepositories } = await import('../src/shared/github-api.js');

calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  return response(Array.from({ length: 100 }, (_, i) => ({ full_name: `z/repo-${i}` })));
};
result = await fetchAuthenticatedRepositories('token');
assert.equal(result.length, 100);
assert.equal(calls.length, 1, 'exactly 100 repositories without next makes one request');

calls = [];
globalThis.fetch = async (url) => {
  calls.push(String(url));
  if (calls.length === 1) return response([{ full_name: 'b/repo' }, { full_name: 'a/repo' }], { link: '<https://api.github.com/user/repos?page=2>; rel="next"' });
  return response([{ full_name: 'a/repo' }, { full_name: 'c/repo', private: true, visibility: 'private', archived: true, fork: true, html_url: 'https://github.com/c/repo' }]);
};
result = await fetchAuthenticatedRepositories('token');
assert.deepEqual(result.map((repo) => repo.fullName), ['a/repo', 'b/repo', 'c/repo']);
assert.equal(result[2].private, true);
assert.equal(calls.length, 2, 'valid next link is followed');

calls = [];
globalThis.fetch = async () => response([], { link: '<https://example.com/user/repos?page=2>; rel="next"' });
await assert.rejects(() => fetchAuthenticatedRepositories('token'), /unsafe pagination/i);

calls = [];
globalThis.fetch = async () => response([], { link: '<https://api.github.com/user/repos?page=1>; rel="next"' });
await assert.rejects(() => fetchAuthenticatedRepositories('token'), /repeated/i);

calls = [];
globalThis.fetch = async () => response({ items: [] });
await assert.rejects(() => fetchAuthenticatedRepositories('token'), /unexpected response format/i);

__resetGitHubRequestLimiterForTest();
console.log('settings github optimization tests passed');
