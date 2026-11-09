import { simulatedFooterIcon } from './helpers/summary-image-icon.mjs';
import assert from 'node:assert/strict';
import { prepareSummaryImageData, validateSummaryImageData } from '../src/shared/summary-image-data.js';
import { renderSummaryImage, renderSummaryImagePng, encodeSummaryImagePng } from '../src/shared/summary-image.js';

const old = '2026-01-01T12:00:00Z', recent = '2026-02-01T12:00:00Z';
const snapshot = {
  repositories: ['fictional/one', 'fictional/two'],
  latestStats: {
    'fictional/one': { stars: 10, forks: 2, subscribers: 3, fetchedAt: recent, trafficFetchedAt: '2020-01-01T00:00:00Z', clonesFetchedAt: '2019-01-01T00:00:00Z', referrersFetchedAt: '2018-01-01T00:00:00Z' },
    'fictional/two': { stars: 0, forks: 0, subscribers: 0, fetchedAt: old },
    'unconfigured/ignored': { stars: 999, forks: 999, subscribers: 999, fetchedAt: '2000-01-01T00:00:00Z' },
  },
  accountStats: { login: 'fictional-example', followers: 0, fetchedAt: recent },
};
const before = structuredClone(snapshot);
const normal = prepareSummaryImageData(snapshot);
assert.deepEqual(snapshot, before, 'preparation never mutates source data');
assert.deepEqual([normal.followers, normal.stars, normal.forks, normal.watchers, normal.validRepositories, normal.configuredRepositories], [0, 10, 2, 3, 2, 2]);
assert.equal(normal.dataAsOf, old, 'only contributing metadata/account timestamps matter');
assert.equal(prepareSummaryImageData({ ...snapshot, accountStats: { ...snapshot.accountStats, fetchedAt: '2025-01-01T00:00:00Z' } }).dataAsOf, '2025-01-01T00:00:00Z');
const missingAccount = prepareSummaryImageData({ ...snapshot, accountStats: null });
assert.equal(missingAccount.followers, null);
assert.equal(missingAccount.username, '');
assert.equal(prepareSummaryImageData({ ...snapshot, accountStats: { login: '', followers: 0, fetchedAt: '' } }).followers, null);
const partial = prepareSummaryImageData({ ...snapshot, latestStats: { 'fictional/one': snapshot.latestStats['fictional/one'] } });
assert.equal(partial.validRepositories, 1); assert.equal(partial.configuredRepositories, 2); assert.equal(partial.dataAsOf, recent);
const empty = prepareSummaryImageData({ repositories: snapshot.repositories });
assert.equal(empty.stars, null); assert.equal(empty.dataAsOf, null);
assert.equal(prepareSummaryImageData({ repositories: [] }).configuredRepositories, 0);
const accountOnly = prepareSummaryImageData({ repositories: snapshot.repositories, accountStats: snapshot.accountStats });
assert.equal(accountOnly.stars, null); assert.equal(accountOnly.followers, 0); assert.equal(accountOnly.dataAsOf, recent);
for (const invalidMetadata of [{ ...snapshot.latestStats['fictional/one'], fetchedAt: 'invalid' }, { stars: 10, forks: 2, fetchedAt: old }]) {
  const result = prepareSummaryImageData({ repositories: ['fictional/one'], latestStats: { 'fictional/one': invalidMetadata } });
  assert.equal(result.validRepositories, 0); assert.equal(result.stars, null); assert.equal(result.dataAsOf, null);
}
const zeros = prepareSummaryImageData({ ...snapshot, repositories: ['fictional/two'] });
assert.deepEqual([zeros.followers, zeros.stars, zeros.forks, zeros.watchers], [0, 0, 0, 0]);
for (const bad of [undefined, {}, { repositories: ['duplicate', 'duplicate'] }, { repositories: [''] }, { repositories: [], latestStats: null }]) assert.throws(() => prepareSummaryImageData(bad));
for (const bad of [-1, NaN, Infinity, '1', Number.MAX_SAFE_INTEGER + 1]) {
  assert.throws(() => validateSummaryImageData({ ...normal, stars: bad }));
  assert.equal(prepareSummaryImageData({ ...snapshot, latestStats: { 'fictional/one': { ...snapshot.latestStats['fictional/one'], stars: bad } } }).validRepositories, 0);
}
for (const bad of [{ username: '\n' }, { username: 'a'.repeat(257) }, { dataAsOf: 'bad' }, { validRepositories: 3 }, { validRepositories: 0 }, { followers: undefined }]) assert.throws(() => validateSummaryImageData({ ...normal, ...bad }));
assert.throws(() => prepareSummaryImageData({ ...snapshot, latestStats: Object.fromEntries(snapshot.repositories.map((name) => [name, { stars: Number.MAX_SAFE_INTEGER, forks: 0, subscribers: 0, fetchedAt: old }])) }), /stars/);

// Deterministic contract/encoding tests. Real browser preview is required for visual assessment.
const labels = [], images = [], rectangles = [];
const paint = { addColorStop() {} };
const ctx = new Proxy({ drawImage: (...args) => images.push(args), roundRect: (...args) => rectangles.push(args), measureText: (value) => ({ width: value.length * 25 }), fillText: (...args) => labels.push(args), createLinearGradient: () => paint, createRadialGradient: () => paint }, {
  get(target, key) { return key in target ? target[key] : () => {}; },
});
globalThis.Path2D = class {};
const png = new Blob(['fixture'], { type: 'image/png' });
const document = { fonts: { ready: Promise.resolve() }, createElement: (tag) => tag === 'img' ? simulatedFooterIcon() : ({ getContext: () => ctx, toBlob: (callback) => queueMicrotask(() => callback(png)) }) };
await renderSummaryImage(normal, { document });
assert.deepEqual(labels.slice(0, 2).map(([value, , y]) => [value, y]), [['Repository', 139], ['Summary', 139]]);
assert.ok(!labels.some(([value]) => value === 'GitHub'), 'no header wordmark');
assert.deepEqual(labels.filter(([value]) => value.startsWith('Total ')).map(([value, x, y]) => [value, x, y]), [
  ['Total Followers', 239, 430], ['Total Stars', 747, 430],
  ['Total Forks', 239, 678], ['Total Watchers', 747, 678],
]);
assert.deepEqual(images[0].slice(1), [144, 1289, 84, 84], 'actual loaded image is drawn proportionally in footer');
assert.equal(images.length, 1, 'no header image or substitute footer bars');
assert.ok(rectangles.every(([x, y, w, h]) => x >= 0 && y >= 0 && x + w <= 1080 && y + h <= 1440));
assert.ok(!labels.some(([value]) => value.startsWith('Statistics available for')), 'complete metadata does not show a coverage warning');
for (const data of [normal, zeros, partial, empty, missingAccount, { ...normal, username: 'a'.repeat(256), stars: Number.MAX_SAFE_INTEGER }]) {
  const canvas = await renderSummaryImage(data, { document });
  assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1440);
  assert.equal(canvas.width / canvas.height, 3 / 4);
  assert.equal(await encodeSummaryImagePng(canvas), png);
}
assert.ok(labels.some(([value]) => value === 'Statistics available for 1 of 2 repositories'));
assert.ok(labels.some(([value]) => value === 'Account followers unavailable'));
assert.ok(labels.some(([value]) => value === 'Data as of: unavailable'));
assert.ok(labels.some(([value]) => value === '—'));
assert.ok(labels.some(([value]) => value === new Intl.NumberFormat().format(Number.MAX_SAFE_INTEGER)));
assert.equal(await renderSummaryImagePng(normal, { document }), png);
await assert.rejects(renderSummaryImage(normal, { document: null }), /browser document/);
await assert.rejects(renderSummaryImage(normal, { document: { createElement: () => ({ getContext: () => null }) } }), /Canvas 2D/);
await assert.rejects(renderSummaryImage(normal, { document: { fonts: { ready: Promise.reject(new Error('font failure')) } , createElement() {} } }), /font failure/);
await assert.rejects(encodeSummaryImagePng({ width: 1, height: 1 }), /1080/);
for (const toBlob of [(cb) => cb(null), (cb) => cb(new Blob()), () => { throw new Error('encoder failure'); }, () => {}]) {
  await assert.rejects(encodeSummaryImagePng({ width: 1080, height: 1440, toBlob }, 10));
}
// Real asset contract; loading itself is simulated here, not visual verification.
const { readFile } = await import('node:fs/promises');
const asset = await readFile(new URL('../assets/icons/icon-128.png', import.meta.url));
assert.equal(asset.subarray(1, 4).toString(), 'PNG');
assert.deepEqual([asset.readUInt32BE(16), asset.readUInt32BE(20)], [128, 128]);
const rendererSource = await readFile(new URL('../src/shared/summary-image.js', import.meta.url), 'utf8');
assert.doesNotMatch(rendererSource, /Path2D|function github\(|fetch\(|documentContext\.baseURI/);
let pendingImage, encoded = false;
const delayedDocument = {
  // An untrusted document base cannot redirect the packaged icon request.
  baseURI: 'https://untrusted.invalid/',
  createElement(tag) {
    if (tag === 'img') return pendingImage = { naturalWidth: 128, naturalHeight: 128, removeAttribute() {} };
    return { getContext: () => ctx, toBlob(cb) { encoded = true; cb(png); } };
  },
};
const delayed = renderSummaryImagePng(normal, { document: delayedDocument });
assert.equal(encoded, false, 'encoding waits for icon load');
assert.equal(pendingImage.src, new URL('../assets/icons/icon-128.png', import.meta.url).href);
const loadedImage = pendingImage;
pendingImage.onload();
assert.equal(await delayed, png);
assert.equal(encoded, true);
assert.equal(images.at(-1)[0], loadedImage, 'drawImage receives the loaded repository asset');
assert.equal(loadedImage.onload, null); assert.equal(loadedImage.onerror, null);
for (const failure of ['error', 'dimensions', 'timeout', 'throw']) {
  encoded = false;
  let image;
  const failingDocument = { ...delayedDocument, createElement(tag) {
    if (tag !== 'img') return delayedDocument.createElement(tag);
    image = { naturalWidth: 0, naturalHeight: 0, removed: false,
      removeAttribute(name) { assert.equal(name, 'src'); this.removed = true; },
      set src(value) {
        if (failure === 'throw') throw new Error('icon assignment failure');
        if (failure === 'error') queueMicrotask(() => this.onerror());
        if (failure === 'dimensions') queueMicrotask(() => this.onload());
      },
    };
    return image;
  } };
  await assert.rejects(renderSummaryImagePng(normal, { document: failingDocument, iconTimeoutMs: 10 }), /icon/i);
  assert.equal(encoded, false, 'missing icon cannot produce an apparently successful PNG');
  assert.equal(image.removed, true);
  assert.equal(image.onload, null); assert.equal(image.onerror, null);
}
for (const iconTimeoutMs of [0, -1, NaN, Infinity]) {
  await assert.rejects(renderSummaryImage(normal, { document, iconTimeoutMs }), /timeout/);
}
console.log('summary image data, rendering contract, and encoding tests passed');
