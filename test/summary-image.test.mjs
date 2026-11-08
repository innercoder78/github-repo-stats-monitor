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
const labels = [];
const paint = { addColorStop() {} };
const ctx = new Proxy({ measureText: (value) => ({ width: value.length * 25 }), fillText: (...args) => labels.push(args), createLinearGradient: () => paint, createRadialGradient: () => paint }, {
  get(target, key) { return key in target ? target[key] : () => {}; },
});
globalThis.Path2D = class {};
const png = new Blob(['fixture'], { type: 'image/png' });
const document = { fonts: { ready: Promise.resolve() }, createElement: () => ({ getContext: () => ctx, toBlob: (callback) => queueMicrotask(() => callback(png)) }) };
await renderSummaryImage(normal, { document });
assert.ok(!labels.some(([value]) => value.startsWith('Statistics available for')), 'complete metadata does not show a coverage warning');
for (const data of [normal, zeros, partial, empty, missingAccount, { ...normal, username: 'a'.repeat(256), stars: Number.MAX_SAFE_INTEGER }]) {
  const canvas = await renderSummaryImage(data, { document });
  assert.equal(canvas.width, 1200); assert.equal(canvas.height, 1600);
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
await assert.rejects(encodeSummaryImagePng({ width: 1, height: 1 }), /1200/);
for (const toBlob of [(cb) => cb(null), (cb) => cb(new Blob()), () => { throw new Error('encoder failure'); }, () => {}]) {
  await assert.rejects(encodeSummaryImagePng({ width: 1200, height: 1600, toBlob }, 10));
}
console.log('summary image data, rendering contract, and encoding tests passed');
