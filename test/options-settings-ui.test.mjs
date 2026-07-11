import assert from 'node:assert/strict';

function deferred() {
  let resolve; let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

class ClassList {
  constructor(el) { this.el = el; }
  contains(name) { return this.el.className.split(/\s+/).includes(name); }
  toggle(name, force) {
    const set = new Set(this.el.className.split(/\s+/).filter(Boolean));
    const shouldAdd = force === undefined ? !set.has(name) : Boolean(force);
    if (shouldAdd) set.add(name); else set.delete(name);
    this.el.className = Array.from(set).join(' ');
  }
}

let fragmentAppendCount = 0;
class Element {
  constructor(tagName = 'div', ownerDocument = null) {
    this.tagName = tagName.toUpperCase(); this.ownerDocument = ownerDocument; this.children = []; this.parentElement = null;
    this.eventListeners = {}; this.dataset = {}; this.style = {}; this.className = ''; this.id = ''; this.value = ''; this.checked = false;
    this.disabled = false; this.hidden = false; this.type = ''; this.name = ''; this.href = ''; this.target = ''; this.rel = ''; this.title = '';
    this._text = ''; this.classList = new ClassList(this);
  }
  append(...nodes) { nodes.flat().forEach((node) => { if (node == null) return; if (typeof node === 'string') { this._text += node; return; } if (node.isFragment) fragmentAppendCount += 1; while (node.isFragment && node.children.length) this.append(node.children.shift()); if (node.isFragment) return; node.remove?.(); node.parentElement = this; this.children.push(node); }); }
  appendChild(node) { this.append(node); return node; }
  insertBefore(node, ref) { node.remove?.(); const i = this.children.indexOf(ref); node.parentElement = this; if (i < 0) this.children.push(node); else this.children.splice(i, 0, node); }
  remove() { if (!this.parentElement) return; const list = this.parentElement.children; const i = list.indexOf(this); if (i >= 0) list.splice(i, 1); this.parentElement = null; }
  replaceChildren(...nodes) { this.textContent = ''; this.append(...nodes); }
  focus() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
  get previousElementSibling() { if (!this.parentElement) return null; const i = this.parentElement.children.indexOf(this); return i > 0 ? this.parentElement.children[i - 1] : null; }
  get nextElementSibling() { if (!this.parentElement) return null; const i = this.parentElement.children.indexOf(this); return i >= 0 ? this.parentElement.children[i + 1] || null : null; }
  set textContent(value) { this._text = String(value); this.children.forEach((c) => { c.parentElement = null; }); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  addEventListener(type, cb) { (this.eventListeners[type] ||= []).push(cb); }
  dispatchEvent(event) { event.target ||= this; (this.eventListeners[event.type] || []).forEach((cb) => cb(event)); }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click', preventDefault() {} }); }
  matches(selector) {
    if (selector === '.import-repository-checkbox:checked') return this.matches('.import-repository-checkbox') && this.checked;
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    if (selector === 'input[name="appearance"]') return this.tagName === 'INPUT' && this.name === 'appearance';
    return this.tagName.toLowerCase() === selector.toLowerCase();
  }
  querySelectorAll(selector) { const out = []; const walk = (node) => { node.children.forEach((child) => { if (child.matches(selector)) out.push(child); walk(child); }); }; walk(this); return out; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  closest(selector) { let node = this; while (node) { if (node.matches(selector)) return node; node = node.parentElement; } return null; }
}
class Fragment extends Element { constructor(doc) { super('#fragment', doc); this.isFragment = true; } }
class Document extends Element {
  constructor() { super('#document', null); this.ownerDocument = this; this.documentElement = new Element('html', this); this.elements = new Map(); }
  createElement(tag) { return new Element(tag, this); }
  createDocumentFragment() { return new Fragment(this); }
  getElementById(id) { if (!this.elements.has(id)) { const el = this.createElement(id.includes('form') ? 'form' : 'div'); el.id = id; this.elements.set(id, el); this.append(el); } return this.elements.get(id); }
  querySelectorAll(selector) { if (selector === 'input[name="appearance"]') return ['light', 'dark'].map((value) => { const el = this.getElementById(`appearance-${value}`); el.tagName = 'INPUT'; el.name = 'appearance'; el.value = value; return el; }); return super.querySelectorAll(selector); }
}

const document = new Document();
globalThis.document = document;
globalThis.window = { location: { href: '' } };
const ids = ['settings-form','github-token','date-format','time-format','notification-background-checks','notification-stars','notification-forks','notification-repo-watchers','notification-account-followers','notification-system','notification-badge','notification-interval','repository-list','add-repository','import-repositories','reset-settings','open-dashboard','open-quick-summary','close-settings','test-connection','repo-message','status-message','test-message','import-panel','import-message','test-results','import-results','add-imported-repositories','quick-summary-message','notification-message','reset-confirmation-dialog','confirm-reset','cancel-reset','extension-version-card','extension-version-title','extension-version-current','extension-version-status','view-latest-version'];
ids.forEach((id) => document.getElementById(id));
['github-token','date-format','time-format','notification-interval'].forEach((id) => { document.getElementById(id).tagName = 'INPUT'; });
document.getElementById('settings-form').tagName = 'FORM';

globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.1.1' }), getURL: (p) => p, lastError: null,
    sendMessage(message, cb) { runtimeMessages.push({ message, cb, deferred: deferred() }); },
  },
  storage: { local: { get(defaults, cb) { cb({ ...defaults, githubToken: 'token', repositories: ['owner/one', 'owner/two'] }); }, set(values, cb) { storageWrites.push(values); cb?.(); }, clear(cb) { cb?.(); } } },
};
const runtimeMessages = []; const storageWrites = [];
await import(`../src/options/options.js?ui=${Date.now()}`);
await new Promise((resolve) => setImmediate(resolve));

const token = document.getElementById('github-token');
const importBtn = document.getElementById('import-repositories');
const testBtn = document.getElementById('test-connection');
const addBtn = document.getElementById('add-imported-repositories');
const importResults = document.getElementById('import-results');
const testResults = document.getElementById('test-results');
const importMessage = document.getElementById('import-message');
const testMessage = document.getElementById('test-message');
const repoList = document.getElementById('repository-list');
const form = document.getElementById('settings-form');
const resetBtn = document.getElementById('confirm-reset');

function completeLast(ok, result, error = '') { const entry = runtimeMessages.at(-1); entry.cb(ok ? { ok: true, result } : { ok: false, error }); return new Promise((resolve) => setImmediate(resolve)); }
function startImport() { importBtn.click(); return runtimeMessages.at(-1); }
function startTest() { testBtn.click(); return runtimeMessages.at(-1); }
function goodTestResult(repo = 'owner/one') { return [{ repository: repo, metadata: { status: 'success', ok: true }, traffic: { status: 'success', ok: true }, clones: { status: 'success', ok: true }, referrers: { status: 'success', ok: true } }]; }
function skippedTestResult() { return [{ repository: 'owner/one', metadata: { status: 'error', ok: false, message: 'no repo' }, traffic: { status: 'skipped', ok: false, message: 'metadata failed' }, clones: { status: 'skipped', ok: false, message: 'metadata failed' }, referrers: { status: 'skipped', ok: false, message: 'metadata failed' } }]; }
function input(el, value) { el.value = value; el.dispatchEvent({ type: 'input' }); }

fragmentAppendCount = 0; startImport(); await completeLast(true, [{ fullName: 'owner/three', visibility: 'public' }]);
assert.equal(importResults.children.length, 1, 'import renders card');
assert.equal(fragmentAppendCount, 1, 'import cards commit one fragment');

fragmentAppendCount = 0; startTest(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 1, 'test renders card');
assert.equal(fragmentAppendCount, 1, 'test cards commit one fragment');

startImport(); input(token, 'new-token'); await completeLast(true, [{ fullName: 'owner/stale' }]);
assert.equal(importResults.children.length, 0, 'token change ignores stale import cards');
assert.equal(importMessage.textContent, '', 'stale import does not replace newer message');

input(token, 'token'); startTest(); input(token, 'changed'); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'token change ignores stale test cards');
assert.equal(testMessage.textContent, '', 'stale test does not replace newer message');

input(token, 'token'); startTest(); input(repoList.querySelector('.repository-input'), 'owner/edited'); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'repo edit invalidates pending test');

startTest(); repoList.querySelector('.move-repository-down').click(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'repo move invalidates pending test');

startTest(); repoList.querySelector('.remove-repository').click(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'repo remove invalidates pending test');

startTest(); document.getElementById('add-repository').click(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'adding blank repo row invalidates pending test');

await completeLast; // noop keep lint calm
input(token, 'token');
repoList.querySelectorAll('.repository-row').slice(1).forEach((row) => row.remove());
input(repoList.querySelector('.repository-input'), 'owner/current');
fragmentAppendCount = 0; startImport(); await completeLast(true, [{ fullName: 'owner/imported' }]);
const checkbox = importResults.querySelector('.import-repository-checkbox'); checkbox.checked = true; checkbox.dispatchEvent({ type: 'change' });
startTest(); assert.equal(addBtn.disabled, true, 'add imported disabled while testing'); await completeLast(true, goodTestResult());
assert.equal(addBtn.disabled, false, 'add imported restored from selection after test');
startTest(); addBtn.disabled = false; addBtn.click(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'adding imported repos invalidates pending test when allowed');
assert.match(importMessage.textContent, /Added 1 repository/, 'stale test does not overwrite import add message');

startImport(); form.dispatchEvent({ type: 'submit', preventDefault() {} }); await completeLast(true, [{ fullName: 'owner/stale-save' }]);
assert.equal(importResults.children.length, 0, 'save invalidates pending import');
startTest(); form.dispatchEvent({ type: 'submit', preventDefault() {} }); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'save invalidates pending test');

startImport(); resetBtn.click(); await completeLast(true, [{ fullName: 'owner/stale-reset' }]);
assert.equal(importResults.children.length, 0, 'reset invalidates pending import');
startTest(); resetBtn.click(); await completeLast(true, goodTestResult());
assert.equal(testResults.children.length, 0, 'reset invalidates pending test');

startTest(); const beforeImportCount = runtimeMessages.length; importBtn.click(); assert.equal(runtimeMessages.length, beforeImportCount, 'import cannot start during test'); await completeLast(true, goodTestResult());
startImport(); const beforeTestCount = runtimeMessages.length; testBtn.click(); assert.equal(runtimeMessages.length, beforeTestCount, 'test cannot start during import'); await completeLast(false, null, 'import failed');
assert.equal(importBtn.disabled, false, 'import button restored after failure');
assert.equal(testBtn.disabled, false, 'test button restored after failure');

input(token, 'token');
if (!repoList.querySelector('.repository-input')) document.getElementById('add-repository').click();
input(repoList.querySelector('.repository-input'), 'owner/current');
startTest(); await completeLast(true, skippedTestResult());
assert.match(testResults.textContent, /Traffic views: Not tested - metadata failed/);
assert.equal(testResults.querySelectorAll('.test-result-status.success').length, 0, 'skipped endpoint not styled success when metadata failed');
assert.match(testMessage.textContent, /Review/, 'metadata failure requires review');
assert.doesNotMatch(testMessage.textContent, /traffic-permission/i);

console.log('options settings ui tests passed');
