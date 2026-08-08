import assert from 'node:assert/strict';
import { getAggregateFreshness, getConservativeFreshness, hasFreshnessCategoryData } from '../src/shared/freshness.js';

const repositories = ['one/repo', 'two/repo', 'three/repo'];
const latestStats = {
  'one/repo': {
    stars: 1, forks: 0, subscribers: 0, fetchedAt: '2026-08-08T04:36:00.000Z',
    views: 0, uniqueVisitors: 0, trafficFetchedAt: '2026-07-25T04:31:00.000Z',
    clones: 0, clonesFetchedAt: '2026-08-01T03:00:00.000Z',
    referrers: [], referrersFetchedAt: '2026-07-20T02:00:00.000Z',
  },
  'two/repo': {
    stars: 2, forks: 3, subscribers: 4, fetchedAt: '2026-08-01T00:00:00.000Z',
    views: 5, uniqueVisitors: 2, trafficFetchedAt: '2026-07-30T00:00:00.000Z',
  },
  'three/repo': {
    stars: 3, forks: 4, subscribers: 5, fetchedAt: '2026-08-05T00:00:00.000Z',
    clones: 6, clonesFetchedAt: '2026-07-15T00:00:00.000Z',
  },
};

assert.equal(hasFreshnessCategoryData(latestStats['one/repo'], 'views'), true, 'zero Views with a successful timestamp is valid');
assert.equal(hasFreshnessCategoryData(latestStats['one/repo'], 'clones'), true, 'zero Clones with a successful timestamp is valid');
assert.equal(hasFreshnessCategoryData(latestStats['one/repo'], 'referrers'), true, 'empty Referrers with a successful timestamp is valid');
assert.equal(hasFreshnessCategoryData({ trafficFetchedAt: '2026-08-08T00:00:00.000Z' }, 'views'), false, 'a timestamp without traffic values is not valid data');

assert.deepEqual(getAggregateFreshness(repositories, latestStats, 'metadata'), {
  timestamp: '2026-08-01T00:00:00.000Z', contributing: 3, total: 3,
}, 'metadata aggregate uses its oldest contributing timestamp');
assert.deepEqual(getAggregateFreshness(repositories, latestStats, 'views'), {
  timestamp: '2026-07-25T04:31:00.000Z', contributing: 2, total: 3,
}, 'Views aggregate uses oldest traffic timestamp and reports partial coverage');
assert.deepEqual(getAggregateFreshness(repositories, latestStats, 'clones'), {
  timestamp: '2026-07-15T00:00:00.000Z', contributing: 2, total: 3,
}, 'Clones aggregate uses oldest clone timestamp and reports partial coverage');
assert.deepEqual(getAggregateFreshness(repositories, latestStats, 'referrers'), {
  timestamp: '2026-07-20T02:00:00.000Z', contributing: 1, total: 3,
}, 'Referrers accepts a successful empty result');
assert.deepEqual(getAggregateFreshness(repositories, {}, 'views'), {
  timestamp: '', contributing: 0, total: 3,
}, 'missing category has no borrowed timestamp');

assert.equal(
  getConservativeFreshness(['one/repo'], latestStats, ['metadata', 'views', 'clones', 'referrers']),
  '2026-07-20T02:00:00.000Z',
  'repository freshness uses the oldest valid successful category, including empty Referrers and zero traffic',
);
assert.equal(
  getConservativeFreshness(repositories, latestStats, ['metadata', 'views', 'clones'], ['2026-08-08T14:59:00.000Z']),
  '2026-07-15T00:00:00.000Z',
  'summary freshness does not borrow a newer metadata or Followers timestamp when traffic is older',
);
assert.equal(getConservativeFreshness(repositories, {}, ['metadata', 'views', 'clones']), '', 'missing saved data has no general timestamp');

console.log('freshness tests passed');
