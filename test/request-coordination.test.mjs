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
await api.fetchGitHub('https://api.github.com/sync-failure');
assert.equal(calls, 2, 'synchronous network failures are retried before success');
await api.fetchGitHub('https://api.github.com/after-sync-failure');
await flush();
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 0, queued: 0 });

api.__resetGitHubRequestLimiterForTest();
global.fetch = () => Promise.reject(new DOMException('aborted', 'AbortError'));
await assert.rejects(api.fetchGitHub('https://api.github.com/aborted'), /aborted/i);
await flush();
assert.deepEqual(api.getGitHubRequestLimiterState(), { active: 0, queued: 0 });

api.__resetGitHubRequestLimiterForTest();

api.__resetGitHubRequestLimiterForTest();
api.__setGitHubRetryDelayForTest(async () => {
  assert.equal(api.getGitHubRequestLimiterState().active, 0, 'limiter slot is released before retry delay');
});
let retryCalls = 0;
global.fetch = async () => {
  retryCalls += 1;
  if (retryCalls === 1) throw new TypeError('network failed');
  return new Response('{}');
};
await api.fetchGitHub('https://api.github.com/retry-network');
assert.equal(retryCalls, 2, 'network failure followed by success is retried');

api.__resetGitHubRequestLimiterForTest();
retryCalls = 0;
global.fetch = async () => {
  retryCalls += 1;
  return new Response('{}', { status: retryCalls === 1 ? 503 : 200 });
};
const retry503 = await api.fetchGitHub('https://api.github.com/retry-503');
assert.equal(retry503.status, 200);
assert.equal(retryCalls, 2, '503 followed by success is retried');

for (const status of [401, 403, 404, 429]) {
  api.__resetGitHubRequestLimiterForTest();
  retryCalls = 0;
  global.fetch = async () => {
    retryCalls += 1;
    return new Response('{}', { status });
  };
  const response = await api.fetchGitHub(`https://api.github.com/no-retry-${status}`);
  assert.equal(response.status, status);
  assert.equal(retryCalls, 1, `${status} is not retried`);
}

api.__resetGitHubRequestLimiterForTest();
retryCalls = 0;
global.fetch = async () => {
  retryCalls += 1;
  return new Response('{}', { status: 503 });
};
const final503 = await api.fetchGitHub('https://api.github.com/max-retry');
assert.equal(final503.status, 503);
assert.equal(retryCalls, 3, 'retry attempts stop after max attempts');

api.__resetGitHubRequestLimiterForTest();
retryCalls = 0;
global.fetch = async () => {
  retryCalls += 1;
  throw new DOMException('aborted', 'AbortError');
};
await assert.rejects(api.fetchGitHub('https://api.github.com/no-retry-abort'), /aborted/i);
assert.equal(retryCalls, 1, 'aborted requests are not retried');

api.__resetGitHubRequestLimiterForTest();
let inFlight = 0;
let maxInFlight = 0;
api.__setGitHubRetryDelayForTest(async () => {});
global.fetch = async () => {
  inFlight += 1;
  maxInFlight = Math.max(maxInFlight, inFlight);
  await Promise.resolve();
  inFlight -= 1;
  return new Response('{}', { status: 503 });
};
await Promise.all(Array.from({ length: 8 }, (_, index) => api.fetchGitHub(`https://api.github.com/overlap-${index}`)));
assert.ok(maxInFlight <= 4, 'total simultaneous raw GitHub requests never exceeds four including retries');
api.__setGitHubRetryDelayForTest(async () => {});
