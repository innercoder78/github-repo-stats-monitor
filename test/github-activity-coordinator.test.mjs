import assert from 'node:assert/strict';

const storageData = {};
let getError = null;
let setError = null;
let setCallCount = 0;
let failSetCallNumber = 0;
let now = Date.parse('2026-07-10T00:00:00.000Z');
const realDateNow = Date.now;
Date.now = () => now;

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

globalThis.chrome = {
  runtime: { lastError: null },
  storage: {
    local: {
      get(defaults, callback) {
        if (getError) {
          chrome.runtime.lastError = getError;
          callback({});
          chrome.runtime.lastError = null;
          return;
        }
        const result = { ...defaults };
        Object.keys(defaults).forEach((key) => {
          if (Object.hasOwn(storageData, key)) result[key] = clone(storageData[key]);
        });
        callback(result);
      },
      set(values, callback) {
        setCallCount += 1;
        if (setError || (failSetCallNumber && setCallCount === failSetCallNumber)) {
          chrome.runtime.lastError = setError || new Error(`write ${setCallCount} failed`);
          callback?.();
          chrome.runtime.lastError = null;
          return;
        }
        Object.assign(storageData, clone(values));
        callback?.();
      },
    },
  },
};

const {
  GITHUB_ACTIVITY_KEY,
  GITHUB_ACTIVITY_STALE_MS,
  __getGitHubActivityLiveOperationCountForTest,
  __resetGitHubActivityLiveOperationsForTest,
  getGitHubActivityStatus,
  markGitHubActivityFinished,
  markGitHubActivityStarted,
  runTrackedGitHubActivity,
} = await import('../src/shared/github-activity.js');

function reset() {
  Object.keys(storageData).forEach((key) => delete storageData[key]);
  getError = null;
  setError = null;
  setCallCount = 0;
  failSetCallNumber = 0;
  now = Date.parse('2026-07-10T00:00:00.000Z');
  __resetGitHubActivityLiveOperationsForTest();
}

reset();
const live = await markGitHubActivityStarted('connection-test');
now += GITHUB_ACTIVITY_STALE_MS + 1000;
let status = await getGitHubActivityStatus();
assert.equal(status.active, true, 'live operation stays active after persisted stale timeout');
assert.ok(status.activeOperations[live.token]);
await markGitHubActivityFinished(live, 'connection-test');
status = await getGitHubActivityStatus();
assert.equal(status.active, false);

reset();
storageData[GITHUB_ACTIVITY_KEY] = {
  active: true,
  activeOperations: {
    stale: {
      source: 'repository-import',
      startedAt: new Date(now - GITHUB_ACTIVITY_STALE_MS - 1000).toISOString(),
      activeUntil: new Date(now - 1000).toISOString(),
    },
  },
};
status = await getGitHubActivityStatus();
assert.equal(status.active, false, 'stale persisted operation without a live reservation expires');
assert.deepEqual(status.activeOperations, {});

reset();
getError = new Error('read failed');
await assert.rejects(markGitHubActivityStarted('repository-import'), /read failed/);
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0, 'failed read releases matching live reservation');
getError = null;
setError = new Error('write failed');
await assert.rejects(markGitHubActivityStarted('repository-import'), /write failed/);
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0, 'failed write releases matching live reservation');

reset();
const oldOperation = await markGitHubActivityStarted('refresh');
now += 10;
const newOperation = await markGitHubActivityStarted('connection-test');
await markGitHubActivityFinished(oldOperation, 'refresh');
status = await getGitHubActivityStatus();
assert.equal(status.active, true, 'finishing one operation preserves others');
assert.equal(Boolean(status.activeOperations[oldOperation.token]), false);
assert.ok(status.activeOperations[newOperation.token], 'older completion cannot clear newer operation');
await markGitHubActivityFinished(newOperation, 'connection-test');

reset();
const successfulResult = await runTrackedGitHubActivity('repository-import', async () => {
  setError = new Error('cleanup failed');
  return { imported: true };
});
assert.deepEqual(successfulResult, { imported: true }, 'cleanup failure does not replace operation result');
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0, 'cleanup failure still removes live reservation');
setError = null;

reset();
await assert.rejects(runTrackedGitHubActivity('connection-test', async () => {
  setError = new Error('cleanup failed');
  throw new Error('task failed');
}), /task failed/, 'cleanup failure does not replace original task error');
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 0);
setError = null;


reset();
failSetCallNumber = 2;
const overlappingA = markGitHubActivityStarted('refresh');
const overlappingB = markGitHubActivityStarted('repository-import');
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 2, 'overlapping starts reserve both operations before storage completes');
const admittedA = await overlappingA;
await assert.rejects(overlappingB, /write 2 failed/);
assert.equal(__getGitHubActivityLiveOperationCountForTest(), 1, 'failed overlapping start releases only its own live reservation');
status = await getGitHubActivityStatus();
assert.equal(status.active, true);
assert.ok(status.activeOperations[admittedA.token], 'successful overlapping start remains active');
assert.equal(Object.keys(status.activeOperations).length, 1, 'failed overlapping start is absent from effective activity');
assert.equal(Object.keys(storageData[GITHUB_ACTIVITY_KEY].activeOperations).length, 1, 'failed overlapping start is absent from persisted activity');
assert.ok(storageData[GITHUB_ACTIVITY_KEY].activeOperations[admittedA.token]);
await markGitHubActivityFinished(admittedA, 'refresh');
status = await getGitHubActivityStatus();
assert.equal(status.active, false, 'no false activity remains after the successful operation finishes');
assert.deepEqual(storageData[GITHUB_ACTIVITY_KEY].activeOperations, {});

reset();
setError = new Error('first update failed');
await assert.rejects(markGitHubActivityStarted('repository-import'), /first update failed/);
setError = null;
const recovered = await markGitHubActivityStarted('version-check');
assert.ok(recovered.token, 'mutation queue recovers after rejected update');
await markGitHubActivityFinished(recovered, 'version-check');

Date.now = realDateNow;
