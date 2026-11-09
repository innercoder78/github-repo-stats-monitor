import assert from 'node:assert/strict';
import { refreshStatsCache, refreshRepositoryStatsCache } from '../src/shared/refresh-stats.js';
import { getLatestStats, saveSettings, saveAccountStats } from '../src/shared/storage.js';
import { summaryImageTokenHash, selectSummaryImageRepositories } from '../src/shared/summary-image-account.js';
import { prepareSummaryImageData } from '../src/shared/summary-image-data.js';
import { initializeStatsScreenshot } from '../src/popup/stats-screenshot.js';

// Production refresh/storage/export functions; fictional HTTP, Chrome storage,
// DOM and Canvas. No actual credentials, API calls or browser download claims.
const privateRepo = 'fictional/private-repo', publicRepo = 'fictional/public-repo';
const saved = { githubToken: 'fictional-A', repositories: [privateRepo] };
const clone = (value) => structuredClone(value);
let calls = 0, exporting = false, allowB = false, denyA = false, reads = 0, onRead;
let listener = () => {};
globalThis.chrome = {
  runtime: { lastError: null, getManifest: () => ({ version: '3.2' }), sendMessage() { assert.fail('export cannot send messages'); } },
  storage: {
    local: {
      get(defaults, callback) {
        if (exporting) onRead?.(++reads);
        callback(clone({ ...defaults, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaults)) }));
      },
      set(values, callback) {
        assert.equal(exporting, false, 'export must not write storage');
        Object.assign(saved, clone(values)); callback?.();
      },
    },
    onChanged: { addListener(fn) { listener = fn; } },
  },
  action: { setBadgeText() { assert.fail('export cannot update badge'); } },
};
let holdA, releaseA;
globalThis.fetch = async (url, options) => {
  assert.equal(exporting, false, 'offline export must make zero network requests');
  calls += 1;
  const account = options.headers.Authorization === 'Bearer fictional-A' ? 'A' : 'B';
  const path = new URL(url).pathname;
  const user = path === '/user';
  const privateMetadata = path === `/repos/${privateRepo}`;
  const publicMetadata = path === `/repos/${publicRepo}`;
  if (holdA && account === 'A' && privateMetadata) { holdA(); await new Promise((resolve) => { releaseA = resolve; }); }
  const denied = privateMetadata && (account === 'B' ? !allowB : denyA);
  return {
    ok: !denied, status: denied ? 404 : 200, headers: new Headers(),
    json: async () => user ? { login: `fictional-${account.toLowerCase()}`, followers: account === 'A' ? 11 : 22 }
      : privateMetadata ? (denied ? { message: 'Not Found' } : { stargazers_count: account === 'A' ? 321 : 654, forks_count: 12, subscribers_count: 7 })
        : publicMetadata ? { stargazers_count: 0, forks_count: 0, subscribers_count: 0 }
          : path.endsWith('/referrers') ? [] : { count: 0, uniques: 0, views: [], clones: [] },
  };
};
let labels = [], downloads = 0, button, status, timer;
const paint = { addColorStop() {} };
const ctx = new Proxy({ measureText: () => ({ width: 100 }), fillText: (value) => labels.push(value), createLinearGradient: () => paint, createRadialGradient: () => paint }, { get: (target, key) => target[key] || (() => {}) });
globalThis.Path2D = class {};
globalThis.window = { addEventListener() {} };
globalThis.document = {
  getElementById: (id) => id === 'stats-screenshot' ? button : status,
  body: { append() {} },
  createElement: (tag) => tag === 'canvas' ? { getContext: () => ctx, toBlob: (callback) => callback(new Blob(['simulated PNG'], { type: 'image/png' })) } : { click() { downloads += 1; }, remove() {} },
};
URL.createObjectURL = () => 'blob:fictional'; URL.revokeObjectURL = () => {};
const nativeTimer = setTimeout;
globalThis.setTimeout = (fn, ms) => { const result = nativeTimer(fn, ms); if (ms === 60000) { timer = result; result.unref(); } return result; };
async function exportSaved() {
  button = { setAttribute() {}, addEventListener(type, fn) { this[type] = fn; } }; status = {};
  initializeStatsScreenshot();
  const before = clone(saved), beforeCalls = calls;
  labels = []; downloads = 0; reads = 0; exporting = true;
  try { await button.click(); } finally { exporting = false; clearTimeout(timer); }
  assert.equal(calls, beforeCalls);
  if (!onRead) assert.deepEqual(saved, before, 'export preserves caches, baselines and activity state');
  assert.equal(button.disabled, false);
  return labels;
}
async function refresh() {
  return refreshStatsCache(clone(saved), await getLatestStats(), {
    source: 'background', skipFullRefreshCoordination: true, accountStats: saved.accountStats,
  });
}

await refresh();
const cachedA = clone(saved.latestStats), oldTime = cachedA[privateRepo].fetchedAt;
assert.equal(cachedA[privateRepo].summaryImageTokenHash, await summaryImageTokenHash('fictional-A'));
saved.pendingActivity = { fictional: 'untouched' };
saved.viewedBaselines = { fictional: 'untouched' };
saved.notificationBaselines = { fictional: 'untouched' };
await exportSaved();
assert.ok(labels.includes('@fictional-a') && labels.includes('11') && labels.includes('321'));
assert.equal(downloads, 1, 'unchanged account supports offline cached export');
denyA = true;
await refresh();
assert.ok(saved.latestStats[privateRepo].error);
await exportSaved();
assert.ok(labels.includes('321'), 'same-token failed metadata refresh still permits legitimate saved fallback');
denyA = false;

await saveSettings({ ...saved, githubToken: 'fictional-B' });
// The existing asynchronous reset eventually clears account stats, not repos.
await saveAccountStats({});
assert.equal(saved.latestStats[privateRepo].stars, 321);
await exportSaved();
assert.equal(downloads, 0, 'before B account refresh, old repositories alone are not exported');

const resultB = await refresh();
assert.equal(resultB.accountRefreshed, true);
assert.equal(resultB.accountStats.login, 'fictional-b');
assert.ok(resultB.results[0].stats.error);
assert.equal(saved.latestStats[privateRepo].stars, 321, 'normal failed-refresh fallback is preserved');
assert.equal(saved.latestStats[privateRepo].fetchedAt, oldTime, 'failure retains original freshness');
assert.equal(saved.latestStats[privateRepo].summaryImageTokenHash, cachedA[privateRepo].summaryImageTokenHash, 'failure cannot relabel A metadata as B');
await exportSaved();
assert.equal(downloads, 1);
assert.ok(labels.includes('@fictional-b') && labels.includes('22'));
assert.ok(!labels.includes('321'));
assert.ok(labels.includes('Statistics available for 0 of 1 repositories') && labels.includes('—'), 'safe account-only image reports unavailable repo metrics');

await saveSettings({ ...saved, repositories: [privateRepo, publicRepo] });
await refresh();
await exportSaved();
assert.ok(labels.includes('Statistics available for 1 of 2 repositories'));
assert.ok(labels.includes('0') && !labels.includes('321'), 'new account valid zero metadata is included');
const hashB = await summaryImageTokenHash('fictional-B');
const data = prepareSummaryImageData({ ...saved, latestStats: selectSummaryImageRepositories(saved.latestStats, hashB) });
assert.equal(data.validRepositories, 1);
assert.equal(data.dataAsOf, [saved.accountStats.fetchedAt, saved.latestStats[publicRepo].fetchedAt].sort()[0], 'old excluded metadata is not a freshness contributor');

allowB = true;
await refreshRepositoryStatsCache(clone(saved), await getLatestStats(), privateRepo, { source: 'background' });
assert.equal(saved.latestStats[privateRepo].summaryImageTokenHash, hashB);
await exportSaved();
assert.ok(labels.includes('654') && !labels.some((text) => text.startsWith('Statistics available for')));

// A delayed single-repository request carries A's fingerprint even if it saves
// after B's successful metadata. Export filters it instead of deleting the cache.
let startedA;
const pendingA = new Promise((resolve) => { startedA = resolve; });
holdA = startedA;
const late = refreshRepositoryStatsCache({ ...clone(saved), githubToken: 'fictional-A' }, cachedA, privateRepo, { source: 'background' });
await pendingA;
releaseA(); await late; holdA = null;
assert.equal(saved.latestStats[privateRepo].stars, 321);
assert.equal(saved.latestStats[privateRepo].summaryImageTokenHash, await summaryImageTokenHash('fictional-A'));
await exportSaved();
assert.ok(!labels.includes('321') && labels.includes('Statistics available for 1 of 2 repositories'));

// Legacy ownership cannot be reconstructed offline. Exclude unproven values,
// preserve stored values and permit independently proven account-only export.
delete saved.latestStats[publicRepo].summaryImageTokenHash;
await exportSaved();
assert.ok(labels.includes('Statistics available for 0 of 2 repositories'));
delete saved.summaryImageAccountContext;
await exportSaved();
assert.equal(downloads, 0, 'legacy account plus unverified repos does not fabricate a trustworthy image');
assert.match(status.textContent, /unverified/);
await refreshRepositoryStatsCache(clone(saved), await getLatestStats(), publicRepo, { source: 'background' });
await exportSaved();
assert.equal(downloads, 1);
assert.ok(labels.includes('Account followers unavailable') && !labels.includes('@fictional-b'), 'verified repositories do not legitimize legacy account identity');

// A changing snapshot never downloads, even if both versions are independently
// eligible. Existing broader controller tests also cover token A -> B -> A.
onRead = (count) => {
  if (count === 2) {
    saved.githubToken = 'fictional-A';
    listener({ githubToken: { oldValue: 'fictional-B', newValue: 'fictional-A' } }, 'local');
  }
};
await exportSaved();
assert.equal(downloads, 0);
assert.match(status.textContent, /changed/);
globalThis.setTimeout = nativeTimer;
console.log('account transition, denied metadata, partial/zero/legacy/offline exports and late responses passed (simulated APIs)');
