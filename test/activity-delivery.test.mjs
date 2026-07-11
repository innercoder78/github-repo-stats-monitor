import assert from 'node:assert/strict';
import {
  createEmptyPendingActivity,
  recordRepositoryActivityDelta,
  recordAccountActivityDelta,
  claimPendingActivityForSurface,
  acknowledgePendingActivityForSurface,
  reclaimStaleInFlightActivity,
} from '../src/shared/activity.js';
import { normalizePendingActivity, normalizeViewedBaselines } from '../src/shared/storage.js';

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function repoDelta(activity, surface, container = 'queued') { return activity[surface][container]?.repositories?.['owner/repo']?.starsDelta || 0; }

let activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, '2026-01-01T00:00:00.000Z');
assert.equal(repoDelta(activity, 'quickSummary'), 1);
assert.equal(repoDelta(activity, 'dashboard'), 1);

activity = createEmptyPendingActivity();
recordAccountActivityDelta(activity, 2, null, '2026-01-01T00:00:00.000Z');
assert.equal(activity.quickSummary.queued.account.followersDelta, 2);
assert.equal(activity.dashboard.queued.account.followersDelta, 2);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
const quickClaim = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
assert.equal(quickClaim.activity.repositories['owner/repo'].starsDelta, 1);
assert.equal(activity.quickSummary.queued.repositories['owner/repo'], undefined);
assert.equal(repoDelta(activity, 'dashboard'), 1);
assert.equal(acknowledgePendingActivityForSurface(activity, 'quick-summary', quickClaim.token, { repositories: { 'owner/repo': quickClaim.activity.repositories['owner/repo'] } }).acknowledged, true);
assert.equal(activity.quickSummary.inFlight, null);
assert.equal(repoDelta(activity, 'dashboard'), 1);
assert.equal(claimPendingActivityForSurface(activity, 'quick-summary').token, '');

const dashboardClaim = claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:01.000Z'));
assert.equal(dashboardClaim.activity.repositories['owner/repo'].starsDelta, 1);
assert.equal(acknowledgePendingActivityForSurface(activity, 'dashboard', dashboardClaim.token, { repositories: { 'owner/repo': dashboardClaim.activity.repositories['owner/repo'] } }).acknowledged, true);
assert.equal(claimPendingActivityForSurface(activity, 'dashboard').token, '');

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
const firstQuick = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'quick-summary', firstQuick.token, { repositories: { 'owner/repo': firstQuick.activity.repositories['owner/repo'] } });
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't2');
assert.equal(claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:01.000Z')).activity.repositories['owner/repo'].starsDelta, 2);
assert.equal(claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:02.000Z')).activity.repositories['owner/repo'].starsDelta, 3);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
const firstDashboard = claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'dashboard', firstDashboard.token, { repositories: { 'owner/repo': firstDashboard.activity.repositories['owner/repo'] } });
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't2');
assert.equal(claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:01.000Z')).activity.repositories['owner/repo'].starsDelta, 2);
assert.equal(claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:02.000Z')).activity.repositories['owner/repo'].starsDelta, 3);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
const inFlight = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't2');
assert.equal(repoDelta(activity, 'quickSummary'), 2);
acknowledgePendingActivityForSurface(activity, 'quick-summary', inFlight.token, { repositories: { 'owner/repo': inFlight.activity.repositories['owner/repo'] } });
assert.equal(claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:03.000Z')).activity.repositories['owner/repo'].starsDelta, 2);
assert.equal(acknowledgePendingActivityForSurface(activity, 'quick-summary', inFlight.token, { repositories: { 'owner/repo': inFlight.activity.repositories['owner/repo'] } }).acknowledged, false);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 3, 'Star', null, 't1');
const partial = claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:00.000Z'));
assert.equal(acknowledgePendingActivityForSurface(activity, 'dashboard', 'wrong-token', { repositories: { 'owner/repo': partial.activity.repositories['owner/repo'] } }).acknowledged, false);
assert.equal(activity.dashboard.inFlight.repositories['owner/repo'].starsDelta, 3);
acknowledgePendingActivityForSurface(activity, 'dashboard', partial.token, { repositories: {} });
assert.equal(activity.dashboard.inFlight.repositories['owner/repo'].starsDelta, 3);
const recovered = claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:01.000Z'));
assert.equal(recovered.token, partial.token);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 4, 'Star', null, 't1');
claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
reclaimStaleInFlightActivity(activity, new Date('2026-01-01T00:11:00.000Z').getTime());
assert.equal(repoDelta(activity, 'quickSummary'), 4);
assert.equal(activity.quickSummary.inFlight, null);

const legacy = normalizePendingActivity({
  account: { followersDelta: 1, quickSummaryShown: true, dashboardShown: false },
  repositories: {
    'Owner/Repo': { starsDelta: 5, quickSummaryShown: false, dashboardShown: true },
    'owner/both': { starsDelta: 2, quickSummaryShown: true, dashboardShown: true },
  },
  badgeActivity: { account: true, repositories: { 'Owner/Repo': true }, updatedAt: 'badge' },
  updatedAt: 'legacy',
});
assert.equal(legacy.quickSummary.queued.repositories['owner/repo'].starsDelta, 5);
assert.equal(legacy.dashboard.queued.account.followersDelta, 1);
assert.equal(legacy.dashboard.queued.repositories['owner/repo'], undefined);
assert.equal(legacy.quickSummary.queued.repositories['owner/both'], undefined);
assert.equal(legacy.badgeActivity.repositories['owner/repo'], true);

const baselines = normalizeViewedBaselines({ account: { login: 'me', followers: 10 }, repositories: { 'Owner/Repo': { stars: 1 } }, updatedAt: 'viewed' });
assert.deepEqual(baselines.quickSummary.account, baselines.dashboard.account);
assert.deepEqual(baselines.quickSummary.repositories, baselines.dashboard.repositories);
const changed = clone(baselines);
changed.quickSummary.account.followers = 11;
assert.equal(changed.dashboard.account.followers, 10);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', -1, 'Star', null, 't2');
assert.equal(activity.quickSummary.queued.repositories['owner/repo'], undefined);
assert.equal(activity.dashboard.queued.repositories['owner/repo'], undefined);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
activity.badgeActivity = { account: false, repositories: { 'owner/repo': true }, updatedAt: 'badge' };
const claim = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'quick-summary', claim.token, { repositories: { 'owner/repo': claim.activity.repositories['owner/repo'] } });
assert.equal(activity.badgeActivity.repositories['owner/repo'], undefined);
assert.equal(repoDelta(activity, 'dashboard'), 1);


activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't2');
assert.equal(activity.quickSummary.queued.repositories['owner/repo'].starsDelta, 3);
assert.equal(activity.dashboard.queued.repositories['owner/repo'].starsDelta, 3);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 1, 'Star', null, 't1');
recordRepositoryActivityDelta(activity, 'owner/other', 'forksDelta', 2, 'Fork', null, 't1');
claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:00.000Z'));
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 3, 'Star', null, 't2');
const copied = createEmptyPendingActivity(activity);
assert.equal(copied.quickSummary.queued.repositories['owner/repo'].starsDelta, 3);
assert.equal(copied.dashboard.queued.repositories['owner/repo'].starsDelta, 3);
assert.equal(copied.quickSummary.inFlight.repositories['owner/repo'].starsDelta, 1);
assert.equal(copied.dashboard.inFlight.repositories['owner/other'].forksDelta, 2);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 2, 'Star', null, 't1');
const invalidPartial = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'quick-summary', invalidPartial.token, { repositories: { 'owner/repo': { starsDelta: 1 } } });
assert.equal(activity.quickSummary.inFlight.repositories['owner/repo'].starsDelta, 2);
acknowledgePendingActivityForSurface(activity, 'quick-summary', invalidPartial.token, { repositories: { 'owner/repo': { starsDelta: 2 } } });
assert.equal(activity.quickSummary.inFlight, null);


activity = createEmptyPendingActivity();
recordAccountActivityDelta(activity, 4, null, 't1');
activity.badgeActivity = { account: true, repositories: {}, updatedAt: 'badge' };
const accountClaim = claimPendingActivityForSurface(activity, 'dashboard', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'dashboard', accountClaim.token, { account: { followersDelta: 3 } });
assert.equal(activity.dashboard.inFlight.account.followersDelta, 4);
assert.equal(activity.badgeActivity.account, true);
acknowledgePendingActivityForSurface(activity, 'dashboard', accountClaim.token, { account: true });
assert.equal(activity.dashboard.inFlight.account.followersDelta, 4);
acknowledgePendingActivityForSurface(activity, 'dashboard', accountClaim.token, { account: {} });
assert.equal(activity.dashboard.inFlight.account.followersDelta, 4);
acknowledgePendingActivityForSurface(activity, 'dashboard', accountClaim.token, { account: { followersDelta: 4 } });
assert.equal(activity.dashboard.inFlight, null);
assert.equal(activity.badgeActivity.account, false);
assert.equal(acknowledgePendingActivityForSurface(activity, 'dashboard', accountClaim.token, { account: { followersDelta: 4 } }).acknowledged, false);
assert.equal(acknowledgePendingActivityForSurface(activity, 'dashboard', 'stale', { account: { followersDelta: 4 } }).acknowledged, false);

activity = createEmptyPendingActivity();
recordRepositoryActivityDelta(activity, 'owner/repo', 'starsDelta', 5, 'Star', null, 't1');
activity.badgeActivity = { account: false, repositories: { 'owner/repo': true, 'owner/other': true }, updatedAt: 'badge' };
const badgeClaim = claimPendingActivityForSurface(activity, 'quick-summary', new Date('2026-01-01T00:00:00.000Z'));
acknowledgePendingActivityForSurface(activity, 'quick-summary', badgeClaim.token, { repositories: { 'owner/repo': { starsDelta: 4 } } });
assert.equal(activity.badgeActivity.repositories['owner/repo'], true);
acknowledgePendingActivityForSurface(activity, 'quick-summary', badgeClaim.token, { repositories: { 'owner/repo': { starsDelta: 5 } } });
assert.equal(activity.badgeActivity.repositories['owner/repo'], undefined);
assert.equal(activity.badgeActivity.repositories['owner/other'], true);

console.log('activity delivery tests passed');
