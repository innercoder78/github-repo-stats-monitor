import assert from 'node:assert/strict';

const elements = new Map();
const renderEvents = [];
const messages = [];
const storageData = {
  githubToken: 'token',
  repositories: ['owner/repo'],
  latestStats: { 'owner/repo': { repository: 'owner/repo', stars: 1, forks: 2, subscribers: 3, views: 0, uniqueVisitors: 0, clones: 0, referrers: [], fetchedAt: '2026-08-08T14:59:00.000Z', trafficFetchedAt: '2026-08-08T14:45:00.000Z', clonesFetchedAt: '2026-08-08T14:45:00.000Z', referrersFetchedAt: '2026-08-08T14:45:00.000Z', trafficError: 'new traffic request failed', clonesError: 'new clone request failed', referrersError: 'new referrers request failed' } },
  accountStats: { login: 'me', followers: 5, fetchedAt: '2026-08-08T14:59:00.000Z' },
  pendingActivity: { quickSummary: { queued: { account: {}, repositories: {}, updatedAt: '' }, inFlight: null }, dashboard: { queued: { account: {}, repositories: {}, updatedAt: '' }, inFlight: null }, badgeActivity: { account: false, repositories: {}, updatedAt: '' }, updatedAt: '' },
  viewedBaselines: { quickSummary: { account: {}, repositories: {}, updatedAt: '' }, dashboard: { account: {}, repositories: {}, updatedAt: '' }, updatedAt: '' },
};

function clone(value) { return value && typeof value === 'object' ? JSON.parse(JSON.stringify(value)) : value; }

class FakeClassList {
  constructor() { this.values = new Set(); }
  add(...values) { values.forEach((value) => this.values.add(value)); }
  remove(...values) { values.forEach((value) => this.values.delete(value)); }
  toggle(value, force) { if (force === false) this.values.delete(value); else this.values.add(value); }
  contains(value) { return this.values.has(value); }
}

class FakeElement {
  constructor(tagName = 'div', id = '') {
    this.tagName = tagName;
    this.id = id;
    this.children = [];
    this.listeners = {};
    this.classList = new FakeClassList();
    this.dataset = {};
    this.style = {};
    this.attributes = {};
    this.disabled = false;
    this.hidden = false;
    this.href = '';
    this._textContent = '';
  }
  set textContent(value) { this._textContent = String(value); if (this.id === 'repo-grid') renderEvents.push('grid-text'); }
  get textContent() { return this._textContent; }
  append(...children) { this.children.push(...children); if (this.id === 'repo-grid') renderEvents.push('grid-append'); }
  appendChild(child) { this.append(child); return child; }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  removeAttribute(name) { delete this.attributes[name]; }
  addEventListener(type, listener) { this.listeners[type] = listener; }
  querySelector() { return new FakeElement('span'); }
  closest() { return new FakeElement('div'); }
}

function element(id) {
  if (!elements.has(id)) elements.set(id, new FakeElement('div', id));
  return elements.get(id);
}

const ids = ['repo-grid', 'empty-state', 'empty-title', 'empty-message', 'summary-card', 'summary-freshness', 'status-line', 'refresh-now', 'open-quick-summary', 'close-dashboard', 'quick-summary-message', 'total-views', 'total-stars', 'total-forks', 'total-clones', 'account-followers', 'total-watchers', 'open-settings', 'empty-open-settings'];
ids.forEach(element);

globalThis.document = {
  documentElement: new FakeElement('html', 'document-element'),
  getElementById: element,
  createElement: (tagName) => new FakeElement(tagName),
  createElementNS: (namespace, tagName) => new FakeElement(tagName),
  createTextNode: (value) => ({ nodeType: 3, textContent: String(value) }),
};

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.1' }),
    getURL: (path) => path,
    lastError: null,
    onMessage: { addListener() {} },
    sendMessage(message) {
      messages.push(message);
      if (message.action === 'activity.claim') {
        renderEvents.push('claim');
        return Promise.resolve({ ok: true, result: { pendingActivity: clone(storageData.pendingActivity) } });
      }
      if (message.action === 'refreshStats.full') {
        return Promise.resolve({ ok: true, result: { skipped: true, reason: 'completed-recently' } });
      }
      return Promise.resolve({ ok: true, result: {} });
    },
  },
  storage: { local: {
    get(defaults, callback) { const result = { ...defaults }; Object.keys(defaults).forEach((key) => { if (Object.hasOwn(storageData, key)) result[key] = clone(storageData[key]); }); callback(result); },
    set(values, callback) { Object.assign(storageData, clone(values)); callback?.(); },
  }, onChanged: { addListener() {} } },
};

globalThis.window = { close() {} };

await import('../src/dashboard/dashboard.js');
await Promise.resolve();
await Promise.resolve();

assert.ok(messages.some((message) => message.action === 'activity.claim' && message.surface === 'dashboard'), 'Dashboard initialization claims activity');
assert.ok(renderEvents.indexOf('claim') !== -1 && renderEvents.indexOf('grid-append') > renderEvents.indexOf('claim'), 'Dashboard renders after activity claim completes');

function descendantText(node) {
  if (!node || typeof node !== 'object' || node.nodeType === 3) return node?.textContent || '';
  return `${node._textContent || ''}${(node.children || []).map(descendantText).join('')}`;
}

const cardText = descendantText(element('repo-grid'));
assert.match(cardText, /Data as of: 08\/08\/2026 2:45 PM/, 'repository card shows one timestamp using its oldest successful category');
assert.doesNotMatch(cardText, /Metadata:|Views:|Clones:|Referrers:|2:59 PM/, 'repository card does not visibly show category freshness details or newer metadata time');
assert.match(cardText, /Traffic data error: new traffic request failed/, 'cached traffic warning remains visible');
assert.match(cardText, /Clone data error: new clone request failed/, 'cached clone warning remains visible');
assert.match(cardText, /Showing last saved referring sites because the latest referrers request failed/, 'cached Referrers warning remains visible');
assert.equal(descendantText(element('total-views')), '0', 'successful zero Views is rendered as cached data');
assert.equal(descendantText(element('total-clones')), '0', 'successful zero Clones is rendered as cached data');
assert.equal(element('summary-freshness').textContent, 'Data as of: 08/08/2026 2:45 PM', 'summary does not advance past older traffic when Followers and metadata are newer');

const initialClaimCount = messages.filter((message) => message.action === 'activity.claim').length;
await element('refresh-now').listeners.click();
await Promise.resolve();
await Promise.resolve();

assert.ok(messages.some((message) => message.action === 'refreshStats.full'), 'Dashboard refresh path sends full refresh request');
assert.ok(messages.filter((message) => message.action === 'activity.claim').length > initialClaimCount, 'Skipped full refresh reloads saved data and claims activity');
assert.equal(element('status-line').textContent, 'Showing recently refreshed data.');
