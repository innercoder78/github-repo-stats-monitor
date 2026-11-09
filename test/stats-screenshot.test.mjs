import { simulatedFooterIcon } from './helpers/summary-image-icon.mjs';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { initializeStatsScreenshot } from '../src/popup/stats-screenshot.js';
import { summaryImageAccountContext, summaryImageTokenHash } from '../src/shared/summary-image-account.js';

// Real controller + preparation + renderer; DOM, Canvas encoding and Chrome
// storage are simulated. These tests cannot establish browser download behavior.
const old = '2026-01-01T12:00:00Z';
const recent = '2026-02-01T12:00:00Z';
const fixtureHash = await summaryImageTokenHash('fictional-token');
const fixture = () => ({
  githubToken: 'fictional-token', repositories: ['fictional/one', 'fictional/two'],
  accountStats: { login: 'fictional-user', followers: 0, fetchedAt: recent },
  summaryImageAccountContext: { tokenHash: fixtureHash, login: 'fictional-user', fetchedAt: recent },
  latestStats: {
    'fictional/one': { stars: 12, forks: 3, subscribers: 7, fetchedAt: recent, summaryImageTokenHash: fixtureHash },
    'fictional/two': { stars: 0, forks: 0, subscribers: 0, fetchedAt: old, trafficFetchedAt: '2000-01-01', summaryImageTokenHash: fixtureHash },
    'private/ignored': { stars: 9999, forks: 9999, subscribers: 9999, fetchedAt: recent },
  },
  displayPreferences: { dateFormat: 'yyyy/mm/dd', timeFormat: '24-hour' },
});
const originalSetTimeout = globalThis.setTimeout;
const originalClearTimeout = globalThis.clearTimeout;
let graceTimers;
globalThis.setTimeout = (fn, ms) => {
  if (ms !== 60000) return originalSetTimeout(fn, ms);
  const timer = { fn, ms }; graceTimers.add(timer); return timer;
};
globalThis.clearTimeout = (timer) => {
  if (graceTimers?.has(timer)) graceTimers.delete(timer);
  else originalClearTimeout(timer);
};
let saved, button, status, storageListener, pagehide, readError, readCount;
let labels, canvases, created, revoked, anchors, requests, renderError, iconError, encodingError, clickError, urlError, onRead, fontReady;
const noop = () => {};
function reset() {
  saved = fixture(); labels = []; canvases = []; created = []; revoked = []; anchors = []; requests = [];
  graceTimers = new Set(); readCount = 0;
  readError = renderError = iconError = encodingError = clickError = urlError = false; onRead = null;
  fontReady = Promise.resolve();
  button = { disabled: false, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(type, fn) { this[type] = fn; } };
  status = { hidden: true, textContent: '' };
  globalThis.chrome = {
    runtime: { lastError: null, sendMessage() { assert.fail('Screenshot must not send messages'); } },
    storage: {
      local: {
        get(defaults, callback) {
          readCount += 1;
          onRead?.(readCount);
          chrome.runtime.lastError = readError ? { message: 'sensitive internal error' } : null;
          callback(structuredClone({ ...defaults, ...saved }));
          chrome.runtime.lastError = null;
        },
        set() { assert.fail('Screenshot must not write storage or activity baselines'); },
      },
      onChanged: { addListener(fn) { storageListener = fn; } },
    },
    action: { setBadgeText() { assert.fail('Screenshot must not change the badge'); } },
  };
  globalThis.fetch = () => assert.fail('Screenshot must not make network requests');
  globalThis.window = { addEventListener(event, fn) { assert.equal(event, 'pagehide'); pagehide = fn; } };
  globalThis.Path2D = class {};
  const gradient = { addColorStop: noop };
  const context = new Proxy({
    measureText: (value) => ({ width: value.length * 20 }),
    fillText: (value) => labels.push(value),
    createLinearGradient: () => gradient, createRadialGradient: () => gradient,
  }, { get: (target, key) => key in target ? target[key] : noop });
  globalThis.document = {
    getElementById: (id) => id === 'stats-screenshot' ? button : status,
    fonts: { get ready() { return fontReady; } },
    body: { append: (anchor) => { anchor.attached = true; } },
    createElement(tag) {
      if (tag === 'img') return simulatedFooterIcon({ fail: iconError });
      if (tag === 'canvas') {
        const canvas = {
          getContext: () => renderError ? null : context,
          toBlob(callback, type) { assert.equal(type, 'image/png'); callback(encodingError ? null : new Blob(['mock-png'], { type })); },
        };
        canvases.push(canvas); return canvas;
      }
      assert.equal(tag, 'a');
      const anchor = {
        click() { if (clickError) throw new Error('internal error'); assert.equal(this.attached, true); requests.push(this.href); },
        remove() { this.attached = false; },
      };
      anchors.push(anchor); return anchor;
    },
  };
  URL.createObjectURL = (blob) => { if (urlError) throw new Error('internal URL error'); assert.equal(blob.type, 'image/png'); const url = `blob:fictional-${created.length}`; created.push(url); return url; };
  URL.revokeObjectURL = (url) => revoked.push(url);
  initializeStatsScreenshot();
}
async function click() { await button.click(); assert.equal(button.disabled, false); assert.equal(button.attributes['aria-busy'], 'false'); }
function change(values) {
  Object.assign(saved, values);
  storageListener(Object.fromEntries(Object.entries(values).map(([key, newValue]) => [key, { newValue }])), 'local');
}

reset();
assert.equal(readCount, 0, 'initialization does not read stats, refresh or export');
saved.latestStats['fictional/one'].stars = 37;
const before = structuredClone(saved);
await click();
assert.deepEqual(saved, before);
assert.equal(readCount, 2, 'read on click, then revalidate before dispatch');
assert.ok(labels.includes('37') && labels.includes('3') && labels.includes('7') && labels.includes('0'));
assert.ok(labels.includes('@fictional-user'));
assert.ok(labels.some((label) => label.startsWith('Data as of:') && label.includes('2026/01/01')));
assert.ok(!labels.some((label) => /fictional\/|private\/|token|9999|2000/.test(label)));
assert.deepEqual(canvases.map(({ width, height }) => [width, height]), [[1080, 1440]]);
assert.equal(anchors[0].download, 'repository-summary.png');
assert.equal(anchors[0].attached, false);
assert.equal(status.textContent, 'Download requested. Check Chrome Downloads.');
assert.deepEqual(revoked, [], 'URL is not revoked immediately after dispatch');
assert.equal(graceTimers.size, 1);
[...graceTimers][0].fn();
assert.deepEqual(revoked, created);
assert.equal(graceTimers.size, 0);

reset();
delete saved.latestStats['fictional/two'];
saved.accountStats = null;
// Offline export keeps the saved token for local fingerprint comparison only.
await click();
assert.equal(requests.length, 1);
assert.ok(labels.includes('Statistics available for 1 of 2 repositories'));
assert.ok(labels.includes('Account followers unavailable'));

reset();
saved.latestStats = {};
await click();
assert.equal(requests.length, 1, 'valid account-only data is meaningful and indicates missing repositories');
assert.ok(labels.includes('Statistics available for 0 of 2 repositories'));
assert.ok(labels.includes('0') && labels.includes('—'));

for (const mutate of [
  () => { saved.accountStats = null; saved.latestStats = {}; },
  () => { saved.accountStats.followers = undefined; saved.latestStats = {}; },
  () => { saved.accountStats.fetchedAt = 'invalid'; saved.summaryImageAccountContext.fetchedAt = 'invalid'; saved.latestStats = {}; },
  () => { saved.repositories = []; },
  () => { saved.repositories = ['fictional/one', 'fictional/one']; },
]) {
  reset(); mutate(); await click(); assert.equal(requests.length, 0); assert.match(status.textContent, /Settings|unavailable|invalid/);
}

for (const kind of ['storage', 'render', 'icon', 'encoding', 'url', 'click']) {
  reset();
  iconError = kind === 'icon'; readError = kind === 'storage'; renderError = kind === 'render'; encodingError = kind === 'encoding'; urlError = kind === 'url'; clickError = kind === 'click';
  await click();
  assert.equal(requests.length, 0);
  assert.match(status.textContent, /Unable/);
  assert.doesNotMatch(status.textContent, /internal|sensitive|Download requested/);
  assert.deepEqual(revoked, created, 'failed request releases its URL');
  readError = renderError = iconError = encodingError = urlError = clickError = false;
  await click(); assert.equal(requests.length, 1, 'failure permits retry');
}

reset();
let finishFonts;
fontReady = new Promise((resolve) => { finishFonts = resolve; });
const firstClick = button.click();
await button.click();
assert.equal(button.disabled, true);
assert.equal(button.attributes['aria-busy'], 'true');
finishFonts(); await firstClick;
assert.equal(requests.length, 1, 'duplicate events cannot start concurrent work');

for (const values of [
  { githubToken: 'fictional-replacement' },
  { repositories: ['fictional/one'] },
  { accountStats: { login: 'other-fictional-user', followers: 5, fetchedAt: recent } },
  { latestStats: {} },
]) {
  reset();
  onRead = (count) => { if (count === 2) change(values); };
  await click(); assert.equal(requests.length, 0); assert.match(status.textContent, /changed/);
}
reset();
onRead = (count) => { if (count === 2) saved.accountStats.login = 'other-user'; };
await click(); assert.equal(requests.length, 0, 'second read catches changes before an event is delivered');
reset();
change({ githubToken: 'fictional-other' }); change({ githubToken: 'fictional-token' });
await click(); assert.equal(requests.length, 0, 'token round trip while idle is rejected');

reset();
onRead = (count) => { if (count === 2) storageListener({ pendingActivity: { newValue: {} } }, 'local'); };
await click(); assert.equal(requests.length, 1, 'activity updates do not invalidate or rerender screenshot UI');
pagehide();
assert.equal(graceTimers.size, 0);
assert.deepEqual(revoked, [], 'pagehide does not prematurely revoke an in-flight URL; document owns cleanup');

reset();
onRead = (count) => { if (count === 2) pagehide(); };
await click(); assert.equal(requests.length, 0, 'closed popup cannot dispatch a new download');

reset();
saved.summaryImageAccountContext = await summaryImageAccountContext(saved.githubToken, saved.accountStats);
await click(); assert.equal(requests.length, 1, 'matching account provenance exports');
for (const context of [null, { tokenHash: 'different', login: 'fictional-user', fetchedAt: recent }]) {
  reset(); saved.summaryImageAccountContext = context;
  await click(); assert.equal(requests.length, 0); assert.match(status.textContent, /Account settings changed/);
}
reset();
saved.summaryImageAccountContext = await summaryImageAccountContext('old-fictional-token', saved.accountStats);
await click(); assert.equal(requests.length, 0, 'late old-token account save cannot be exported with the new token');

// Production storage writes atomically invalidate/bind export provenance without
// changing the returned settings/account contracts or touching activity storage.
reset();
const writes = [];
chrome.storage.local.set = (values, callback) => { writes.push(structuredClone(values)); Object.assign(saved, values); callback(); };
const { saveSettings, saveAccountStats } = await import('../src/shared/storage.js');
const settings = { githubToken: 'new-fictional-token', repositories: saved.repositories };
const result = await saveSettings(settings);
assert.equal(result.githubToken, settings.githubToken);
assert.equal(Object.hasOwn(result, 'summaryImageAccountContext'), false);
assert.equal(writes[0].githubToken, settings.githubToken);
assert.equal(writes[0].summaryImageAccountContext, null);
const account = { login: 'fictional-user', followers: 0, fetchedAt: recent };
assert.deepEqual(await saveAccountStats(account, settings.githubToken), account);
assert.deepEqual(writes[1].accountStats, account);
assert.equal(writes[1].summaryImageAccountContext.login, account.login);
assert.equal(writes[1].summaryImageAccountContext.tokenHash.length, 64);
assert.ok(!JSON.stringify(writes[1]).includes(settings.githubToken));
await saveSettings(settings);
assert.equal(Object.hasOwn(writes[2], 'summaryImageAccountContext'), false, 'unchanged token preserves provenance');
await saveAccountStats({});
assert.equal(writes[3].summaryImageAccountContext, null, 'existing account reset also clears export context');
assert.ok(writes.every((write) => !['pendingActivity', 'viewedBaselines', 'notificationBaselines'].some((key) => key in write)));

const html = await readFile(new URL('../src/popup/popup.html', import.meta.url), 'utf8');
assert.match(html, /class="utility-actions">\s*<button id="stats-screenshot"[^>]*type="button"[^>]*>Stats Screenshot<\/button>\s*<button id="close-popup"/);
assert.match(html, /id="screenshot-status" role="status" aria-live="polite" hidden/);
assert.doesNotMatch(html, /Refresh stats\?|type="checkbox"/);
assert.ok(html.indexOf('id="open-dashboard"') < html.indexOf('id="stats-screenshot"'));
assert.ok(html.indexOf('id="open-settings"') < html.indexOf('id="stats-screenshot"'));
const css = await readFile(new URL('../src/popup/popup.css', import.meta.url), 'utf8');
assert.match(css, /\.utility-actions\s*\{[^}]*align-items: flex-start;[^}]*gap: 8px;[^}]*justify-content: space-between;/);
const manifest = JSON.parse(await readFile(new URL('../manifest.json', import.meta.url), 'utf8'));
assert.deepEqual(manifest.permissions, ['storage', 'alarms', 'notifications']);
assert.equal(manifest.version, '3.2');
globalThis.setTimeout = originalSetTimeout;
globalThis.clearTimeout = originalClearTimeout;
console.log('saved screenshot workflow, data, races, failures, cleanup and UI contracts passed (browser APIs simulated)');
