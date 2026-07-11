import assert from 'node:assert/strict';
import { getFullRefreshStatus } from '../src/shared/refresh-status.js';

const okStats = { stars: 1, forks: 1, subscribers: 1 };
const failedStats = { error: 'boom' };
const formatTime = (value) => `time:${value}`;
const status = (result) => getFullRefreshStatus({ fetchedAt: 'done', accountFetchedAt: 'acct', ...result }, { formatTime });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: true,
  results: [{ repository: 'owner/repo', stats: okStats }],
  refreshedRepositoryCount: 1,
  skippedRepositories: [],
}), { status: 'success', message: 'Last successful refresh: time:acct' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: true,
  results: [],
  refreshedRepositoryCount: 0,
  skippedRepositories: ['owner/repo-a', 'owner/repo-b'],
}), { status: 'success', message: 'Account followers refreshed. All repositories used recently refreshed data.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: false,
  results: [{ repository: 'owner/repo', stats: okStats }],
  refreshedRepositoryCount: 1,
  skippedRepositories: [],
}), { status: 'warning', message: 'Refresh finished with partial errors. Account refresh failed; last saved account values are shown where available.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: true,
  results: [{ repository: 'owner/repo', stats: failedStats }],
  refreshedRepositoryCount: 1,
  skippedRepositories: [],
}), { status: 'warning', message: 'Refresh finished with partial errors. Last saved values are shown where available.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: false,
  results: [{ repository: 'owner/repo', stats: failedStats }],
  refreshedRepositoryCount: 1,
  skippedRepositories: [],
}), { status: 'error', message: 'Refresh finished with errors. Last saved values are shown where available.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: false,
  results: [],
  refreshedRepositoryCount: 0,
  skippedRepositories: ['owner/repo'],
}), { status: 'warning', message: 'Account refresh failed; last saved account values are shown where available. All repositories used recently refreshed data.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: true,
  results: [{ repository: 'owner/repo-a', stats: okStats }],
  refreshedRepositoryCount: 1,
  skippedRepositories: ['owner/repo-b'],
}), { status: 'success', message: 'Refreshed 1 repository. 1 skipped due to recent data found.' });

assert.deepEqual(status({
  accountAttempted: true,
  accountRefreshed: true,
  results: [{ repository: 'owner/repo-a', stats: okStats }, { repository: 'owner/repo-b', stats: failedStats }],
  refreshedRepositoryCount: 2,
  skippedRepositories: ['owner/repo-c'],
}), { status: 'warning', message: 'Refreshed 2 repositories. 1 skipped due to recent data found. Refresh finished with partial errors. Last saved values are shown where available.' });
