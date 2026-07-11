import assert from 'node:assert/strict';

const ids = [
  'repository-count', 'token-status', 'last-updated', 'total-stars', 'total-forks', 'total-views',
  'total-clones', 'account-followers', 'total-watchers', 'popup-status', 'refresh-stats',
  'update-card', 'update-body', 'view-latest-version', 'open-dashboard', 'open-settings', 'close-popup',
];
const elements = new Map();
const messages = [];
const refreshResponses = [];
const warnings = [];
let storageData;

console.warn = (...args) => warnings.push(args);

function clone(value) {
  return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value;
}

class ClassList {
  constructor(element) { this.element = element; }
  _set() { return new Set(this.element.className.split(/\s+/).filter(Boolean)); }
  add(...names) { const set = this._set(); names.forEach((name) => set.add(name)); this.element.className = Array.from(set).join(' '); }
  remove(...names) { const set = this._set(); names.forEach((name) => set.delete(name)); this.element.className = Array.from(set).join(' '); }
  contains(name) { return this._set().has(name); }
  toggle(name, force) { const set = this._set(); const add = force === undefined ? !set.has(name) : Boolean(force); if (add) set.add(name); else set.delete(name); this.element.className = Array.from(set).join(' '); }
}

class Element {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.children = [];
    this.parentElement = null;
    this.listeners = {};
    this.className = '';
    this.classList = new ClassList(this);
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.href = '';
    this._text = '';
  }
  set textContent(value) { this._text = String(value); this.children.forEach((child) => { child.parentElement = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map((child) => typeof child === 'string' ? child : child.textContent).join(''); }
  append(...nodes) { nodes.flat().forEach((node) => { if (node == null) return; if (typeof node === 'string') { this._text += node; return; } node.remove?.(); node.parentElement = this; this.children.push(node); }); }
  appendChild(node) { this.append(node); return node; }
  replaceChildren(...nodes) { this.textContent = ''; this.append(...nodes); }
  remove() { if (!this.parentElement) return; const siblings = this.parentElement.children; const index = siblings.indexOf(this); if (index >= 0) siblings.splice(index, 1); this.parentElement = null; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  click() { if (!this.disabled) return this.listeners.click?.({ type: 'click', target: this, preventDefault() {} }); return undefined; }
  matches(selector) { return selector.startsWith('.') ? this.className.split(/\s+/).includes(selector.slice(1)) : false; }
  querySelectorAll(selector) { const out = []; const walk = (node) => { node.children.forEach((child) => { if (typeof child === 'string') return; if (child.matches(selector)) out.push(child); walk(child); }); }; walk(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { return selector.startsWith('.') ? new Element('div') : null; }
}

function element(id) {
  if (!elements.has(id)) elements.set(id, new Element('div', id));
  return elements.get(id);
}

function defaultPendingActivity() {
  return {
    quickSummary: { queued: { account: {}, repositories: {}, updatedAt: '' }, inFlight: null },
    dashboard: { queued: { account: {}, repositories: {}, updatedAt: '' }, inFlight: null },
    badgeActivity: { account: false, repositories: {}, updatedAt: '' },
    updatedAt: '',
  };
}

function resetStorage() {
  storageData = {
    githubToken: 'token',
    repositories: ['owner/repo'],
    appearance: 'light',
    notifications: { backgroundChecksEnabled: true },
    displayPreferences: { dateFormat: 'yyyy/mm/dd', timeFormat: '24-hour' },
    latestStats: {},
    accountStats: { login: 'me', followers: 0, fetchedAt: '' },
    pendingActivity: defaultPendingActivity(),
    notificationBaselines: { account: {}, repositories: {}, initialized: true, updatedAt: '2026-06-01T10:00:00.000Z' },
    quickSummaryStatus: { manualRefreshAt: '2026-06-01T09:00:00.000Z' },
    viewedBaselines: { quickSummary: { account: {}, repositories: {}, updatedAt: '' }, dashboard: { account: {}, repositories: {}, updatedAt: '' }, updatedAt: '' },
    versionCheckStatus: { checkedAt: '', attemptedAt: '', localVersion: '3.1.1', latestVersion: '3.1.1', updateAvailable: false, latestReleaseUrl: '', error: '' },
  };
}

function repoStats(stars) {
  return { repository: 'owner/repo', stars, forks: 7, subscribers: 11, views: 13, uniqueVisitors: 5, clones: 17, fetchedAt: '2026-07-11T12:00:00.000Z', trafficFetchedAt: '2026-07-11T12:00:00.000Z', clonesFetchedAt: '2026-07-11T12:00:00.000Z' };
}

function successfulResult(overrides = {}) {
  const latestStats = { 'owner/repo': repoStats(42) };
  const accountStats = { login: 'me', followers: 99, fetchedAt: '2026-07-11T12:00:00.000Z' };
  return { latestStats, accountStats, fetchedAt: '2026-07-11T12:00:00.000Z', accountFetchedAt: '2026-07-11T12:00:00.000Z', accountAttempted: true, accountRefreshed: true, results: [{ repository: 'owner/repo', stats: latestStats['owner/repo'] }], refreshedRepositoryCount: 1, skippedRepositories: [], pendingActivity: defaultPendingActivity(), ...overrides };
}

function queueRefresh(response) { refreshResponses.push(response); }
function statusText() { return element('popup-status').children.map((child) => child.textContent).join('\n'); }
async function flush() { await new Promise((resolve) => setImmediate(resolve)); await new Promise((resolve) => setImmediate(resolve)); }
async function clickRefresh() { const result = element('refresh-stats').click(); await result; await flush(); }

ids.forEach(element);
globalThis.document = {
  documentElement: new Element('html', 'document-element'),
  getElementById: element,
  createElement: (tagName) => new Element(tagName),
  createElementNS: (namespace, tagName) => new Element(tagName),
  createTextNode: (value) => String(value),
  querySelectorAll: () => [],
};
globalThis.window = { close() {} };
globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.1' }),
    getURL: (path) => path,
    lastError: null,
    onMessage: { addListener() {} },
    openOptionsPage() {},
    sendMessage(message) {
      messages.push(message);
      if (message.action === 'activity.claim' || message.action === 'activity.acknowledge') {
        return Promise.resolve({ ok: true, result: { pendingActivity: clone(storageData.pendingActivity), viewedBaselines: clone(storageData.viewedBaselines), badgeActivity: clone(storageData.pendingActivity.badgeActivity) } });
      }
      if (message.action === 'refreshStats.full') {
        const next = refreshResponses.shift();
        if (next instanceof Error) return Promise.reject(next);
        if (next?.ok === false) return Promise.resolve(next);
        if (next?.result) {
          storageData.latestStats = clone(next.result.latestStats || storageData.latestStats);
          storageData.accountStats = clone(next.result.accountStats || storageData.accountStats);
          storageData.quickSummaryStatus = { manualRefreshAt: next.result.fetchedAt || '2026-07-11T12:00:00.000Z' };
          storageData.pendingActivity = clone(next.result.pendingActivity || storageData.pendingActivity);
        }
        return Promise.resolve(next);
      }
      return Promise.resolve({ ok: true, result: {} });
    },
  },
  tabs: { create() {} },
  action: { setBadgeText() { return Promise.resolve(); } },
  storage: { local: {
    get(defaults, callback) { const result = { ...clone(defaults) }; Object.keys(result).forEach((key) => { if (Object.hasOwn(storageData, key)) result[key] = clone(storageData[key]); }); callback(result); },
    set(values, callback) { Object.assign(storageData, clone(values)); callback?.(); },
  }, onChanged: { addListener() {} } },
};

resetStorage();
await import(`../src/popup/popup.js?production=${Date.now()}`);
await flush();

queueRefresh({ ok: true, result: successfulResult() });
await clickRefresh();
assert.ok(!warnings.some((args) => args.some((arg) => arg instanceof ReferenceError)), 'successful refresh does not throw ReferenceError');
assert.doesNotMatch(statusText(), /Refresh failed\. Last saved values are shown where available\./, 'successful refresh does not show generic failure');
assert.equal(element('total-stars').textContent, '42', 'refreshed repository totals render');
assert.equal(element('account-followers').textContent, '99', 'refreshed account followers render');
assert.ok(messages.some((message) => message.action === 'refreshStats.full' && message.source === 'quick-summary'), 'refresh button sends full refresh request');
assert.match(statusText(), /Manual refresh: 07\/11 12:00/, 'manual-refresh status reloads after success');
assert.match(statusText(), /Background check: 06\/01 10:00/, 'ordinary success shows background-check status line');
assert.equal(element('refresh-stats').disabled, false, 'refresh button restored after success');
assert.equal(element('refresh-stats').textContent, 'Refresh', 'refresh button label restored after success');

queueRefresh({ ok: true, result: successfulResult({ results: [], refreshedRepositoryCount: 0, skippedRepositories: ['owner/repo'] }) });
await clickRefresh();
assert.equal(statusText(), 'Account followers refreshed. All repositories used recently refreshed data.', 'all-repositories-reused message comes from shared status');
assert.equal(element('refresh-stats').disabled, false, 'refresh button restored after reused success');

queueRefresh({ ok: true, result: successfulResult({ results: [{ repository: 'owner/repo', stats: { ...repoStats(51), error: 'boom' } }], latestStats: { 'owner/repo': repoStats(51) } }) });
await clickRefresh();
assert.equal(statusText(), 'Refresh finished with partial errors. Last saved values are shown where available.', 'partial repository failure displays shared partial-error message');
assert.equal(element('refresh-stats').disabled, false, 'refresh button restored after partial error');

queueRefresh({ ok: false, error: 'background failed' });
await clickRefresh();
assert.equal(statusText(), 'Refresh failed. Last saved values are shown where available.', 'unsuccessful background response displays generic refresh-failure message');
assert.equal(element('refresh-stats').disabled, false, 'refresh button restored after unsuccessful response');

queueRefresh(new Error('network failed'));
await clickRefresh();
assert.equal(statusText(), 'Refresh failed. Last saved values are shown where available.', 'rejected background refresh displays generic refresh-failure message');
assert.equal(element('refresh-stats').disabled, false, 'refresh button restored after rejected response');

console.log('popup production path tests passed');
