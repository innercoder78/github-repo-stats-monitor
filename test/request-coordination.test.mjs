import assert from 'node:assert/strict';

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

const api = await import('../src/shared/github-api.js');

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
}

api.__resetGitHubRequestLimiterForTest();
const started = [];
const requests = [];
global.fetch = (url) => {
  const request = deferred();
  started.push(String(url));
  requests.push(request);
  return request.promise;
};

const firstFive = Array.from({ length: 5 }, (_, index) => api.fetchGitHub(`https://api.github.com/test/${index + 1}`));
await flush();
assert.equal(started.length, 4, 'four requests start immediately');
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 4, queued: 1 });
requests[0].resolve(new Response('{}'));
await firstFive[0];
await flush();
assert.equal(started.length, 5, 'one completion admits exactly one queued request');
assert.deepEqual(started, [
  'https://api.github.com/test/1',
  'https://api.github.com/test/2',
  'https://api.github.com/test/3',
  'https://api.github.com/test/4',
  'https://api.github.com/test/5',
]);
requests.slice(1).forEach((request) => request.resolve(new Response('{}')));
await Promise.all(firstFive.slice(1));
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 0, queued: 0 });

api.__resetGitHubRequestLimiterForTest();
let active = 0;
let maxActive = 0;
const overlapped = [];
global.fetch = (url) => {
  active += 1;
  maxActive = Math.max(maxActive, active);
  const request = deferred();
  overlapped.push(request);
  request.promise.finally(() => { active -= 1; });
  return request.promise;
};
const overlapping = ['refresh', 'import', 'connection', 'version', 'extra'].flatMap((name) => [1, 2].map((index) => api.fetchGitHub(`https://api.github.com/${name}/${index}`)));
await flush();
assert.equal(maxActive, 4, 'overlapping features share one four request limit');
while (overlapped.length > 0) {
  const request = overlapped.shift();
  request.resolve(new Response('{}'));
  await flush();
}
await Promise.all(overlapping);
assert.equal(maxActive, 4);

api.__resetGitHubRequestLimiterForTest();
let calls = 0;
global.fetch = () => {
  calls += 1;
  if (calls === 1) throw new Error('sync boom');
  return Promise.resolve(new Response('{}'));
};
await assert.rejects(api.fetchGitHub('https://api.github.com/sync-failure'), /sync boom/);
await api.fetchGitHub('https://api.github.com/after-sync-failure');
await flush();
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 0, queued: 0 });

api.__resetGitHubRequestLimiterForTest();
global.fetch = () => Promise.reject(new DOMException('aborted', 'AbortError'));
await assert.rejects(api.fetchGitHub('https://api.github.com/aborted'), /aborted/i);
await flush();
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 0, queued: 0 });

api.__resetGitHubRequestLimiterForTest();
