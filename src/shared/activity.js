export const ACTIVITY_DELTA_LABELS = Object.freeze({
  starsDelta: 'Star',
  forksDelta: 'Fork',
  repoWatchersDelta: 'Watcher',
  followersDelta: 'Account Follower',
});

const REPOSITORY_ACTIVITY_STATS = Object.freeze([
  { setting: 'stars', deltaKey: 'starsDelta', previousKey: 'stars', currentKey: 'stars', label: ACTIVITY_DELTA_LABELS.starsDelta },
  { setting: 'forks', deltaKey: 'forksDelta', previousKey: 'forks', currentKey: 'forks', label: ACTIVITY_DELTA_LABELS.forksDelta },
  { setting: 'repoWatchers', deltaKey: 'repoWatchersDelta', previousKey: 'subscribers', currentKey: 'subscribers', label: ACTIVITY_DELTA_LABELS.repoWatchersDelta },
]);

export const ACTIVITY_SURFACES = Object.freeze({
  QUICK_SUMMARY: 'quick-summary',
  DASHBOARD: 'dashboard',
});
export const ACTIVITY_IN_FLIGHT_TIMEOUT_MS = 10 * 60 * 1000;

function getTrackedStats(settings) {
  return settings?.notifications?.trackedStats || {};
}

export function pluralizeActivityLabel(label, amount) {
  return Math.abs(Number(amount) || 0) === 1 ? label : `${label}s`;
}

export function formatDelta(delta, label) {
  const numericDelta = Number(delta) || 0;
  const sign = numericDelta >= 0 ? '+' : '-';

  return `${sign}${Math.abs(numericDelta)} ${pluralizeActivityLabel(label, numericDelta)}`;
}

export function getDeltaClass(delta) {
  return Number(delta) >= 0 ? 'activity-delta-positive' : 'activity-delta-negative';
}

function hasTrackedStatBaseline(stats, key) {
  return stats && Object.prototype.hasOwnProperty.call(stats, key) && Number.isFinite(Number(stats[key]));
}

function getAccountLogin(accountStats) {
  return typeof accountStats?.login === 'string' ? accountStats.login.trim() : '';
}

function hasAccountFollowersBaseline(accountStats) {
  return Boolean(accountStats?.fetchedAt) && Boolean(getAccountLogin(accountStats)) && hasTrackedStatBaseline(accountStats, 'followers');
}

export function getRepositoryActivityDeltas(activity) {
  if (!activity || typeof activity !== 'object') {
    return [];
  }

  return REPOSITORY_ACTIVITY_STATS
    .map(({ deltaKey, label }) => ({ key: deltaKey, delta: Number(activity[deltaKey]) || 0, label }))
    .filter(({ delta }) => delta !== 0);
}

function createEmptyActivityQueue() {
  return { account: {}, repositories: {}, updatedAt: '' };
}

function cloneActivityQueue(queue) {
  const source = queue && typeof queue === 'object' ? queue : {};
  const repositories = {};

  Object.entries(source.repositories || {}).forEach(([repository, activity]) => {
    repositories[repository] = { ...activity };
  });

  return {
    account: { ...(source.account || {}) },
    repositories,
    updatedAt: typeof source.updatedAt === 'string' ? source.updatedAt : '',
  };
}

function cloneInFlightActivity(inFlight) {
  if (!inFlight || typeof inFlight !== 'object') {
    return null;
  }

  return {
    ...cloneActivityQueue(inFlight),
    token: typeof inFlight.token === 'string' ? inFlight.token : '',
    claimedAt: typeof inFlight.claimedAt === 'string' ? inFlight.claimedAt : '',
  };
}

function cloneSurfaceActivity(surface) {
  const source = surface && typeof surface === 'object' ? surface : {};

  return {
    queued: cloneActivityQueue(source.queued),
    inFlight: cloneInFlightActivity(source.inFlight),
  };
}

export function createEmptyPendingActivity(existingPendingActivity) {
  return {
    quickSummary: cloneSurfaceActivity(existingPendingActivity?.quickSummary),
    dashboard: cloneSurfaceActivity(existingPendingActivity?.dashboard),
    badgeActivity: existingPendingActivity?.badgeActivity && typeof existingPendingActivity.badgeActivity === 'object'
      ? {
        ...existingPendingActivity.badgeActivity,
        repositories: { ...(existingPendingActivity.badgeActivity.repositories || {}) },
      }
      : { account: false, repositories: {}, updatedAt: '' },
    updatedAt: typeof existingPendingActivity?.updatedAt === 'string' ? existingPendingActivity.updatedAt : '',
  };
}

function applyDelta(value, delta) {
  const nextValue = (Number(value) || 0) + delta;
  return nextValue === 0 ? undefined : nextValue;
}

export function createEmptyPendingChanges() {
  return { account: [], repositories: {} };
}

function queueHasActivity(queue) {
  return Boolean(Number(queue?.account?.followersDelta))
    || Object.values(queue?.repositories || {}).some((activity) => getRepositoryActivityDeltas(activity).length > 0);
}

function updateQueueTimestamp(queue, checkedAt) {
  queue.updatedAt = queueHasActivity(queue) ? checkedAt : '';
}

function queueAccountDelta(queue, delta, checkedAt) {
  const followersDelta = applyDelta(queue.account?.followersDelta, delta);
  queue.account = followersDelta === undefined ? {} : { followersDelta };
  updateQueueTimestamp(queue, checkedAt);
}

function queueRepositoryDelta(queue, repository, deltaKey, delta, checkedAt) {
  const activity = { ...(queue.repositories[repository] || {}), repository };
  const nextDelta = applyDelta(activity[deltaKey], delta);

  if (nextDelta === undefined) {
    delete activity[deltaKey];
  } else {
    activity[deltaKey] = nextDelta;
  }

  if (getRepositoryActivityDeltas(activity).length > 0) {
    queue.repositories[repository] = activity;
  } else {
    delete queue.repositories[repository];
  }

  updateQueueTimestamp(queue, checkedAt);
}

function addToSurfaceQueues(pendingActivity, callback) {
  ['quickSummary', 'dashboard'].forEach((surfaceKey) => {
    if (!pendingActivity[surfaceKey]) {
      pendingActivity[surfaceKey] = cloneSurfaceActivity();
    }

    callback(pendingActivity[surfaceKey].queued);
  });
}

export function recordAccountActivityDelta(pendingActivity, delta, detectedChanges, checkedAt = new Date().toISOString()) {
  if (delta === 0) {
    return false;
  }

  if (detectedChanges) {
    detectedChanges.account.push({ delta, label: ACTIVITY_DELTA_LABELS.followersDelta });
  }

  addToSurfaceQueues(pendingActivity, (queue) => queueAccountDelta(queue, delta, checkedAt));
  return true;
}

export function recordRepositoryActivityDelta(pendingActivity, repository, deltaKey, delta, label, detectedChanges, checkedAt = new Date().toISOString()) {
  if (delta === 0) {
    return false;
  }

  if (detectedChanges) {
    if (!detectedChanges.repositories[repository]) {
      detectedChanges.repositories[repository] = [];
    }

    detectedChanges.repositories[repository].push({ delta, label });
  }

  addToSurfaceQueues(pendingActivity, (queue) => queueRepositoryDelta(queue, repository, deltaKey, delta, checkedAt));
  return true;
}

export function detectPendingActivityFromStats(settings, previousLatestStats, nextLatestStats, previousAccountStats, nextAccountStats, pendingActivity, checkedAt, repositories, detectedChanges) {
  const trackedStats = getTrackedStats(settings);
  let changed = false;

  if (trackedStats.accountFollowers) {
    const previousFollowers = Number(previousAccountStats?.followers);
    const nextFollowers = Number(nextAccountStats?.followers);

    const previousLogin = getAccountLogin(previousAccountStats);
    const nextLogin = getAccountLogin(nextAccountStats);

    if (hasAccountFollowersBaseline(previousAccountStats) && Number.isFinite(nextFollowers) && previousLogin && nextLogin && previousLogin === nextLogin) {
      changed = recordAccountActivityDelta(pendingActivity, nextFollowers - previousFollowers, detectedChanges, checkedAt) || changed;
    }
  }

  repositories.forEach((repository) => {
    const previousStats = previousLatestStats?.[repository];
    const nextStats = nextLatestStats?.[repository];

    REPOSITORY_ACTIVITY_STATS.forEach(({ setting, deltaKey, previousKey, currentKey, label }) => {
      if (!trackedStats[setting]) {
        return;
      }

      const previousValue = Number(previousStats?.[previousKey]);
      const nextValue = Number(nextStats?.[currentKey]);

      if (hasTrackedStatBaseline(previousStats, previousKey) && Number.isFinite(nextValue)) {
        changed = recordRepositoryActivityDelta(pendingActivity, repository, deltaKey, nextValue - previousValue, label, detectedChanges, checkedAt) || changed;
      }
    });
  });

  if (changed) {
    pendingActivity.updatedAt = checkedAt;
  }

  return changed;
}

export function mergeBadgeActivity(pendingActivity, detectedChanges, checkedAt) {
  const accountChanges = Array.isArray(detectedChanges?.account) ? detectedChanges.account : [];
  const repositoryChanges = detectedChanges?.repositories && typeof detectedChanges.repositories === 'object'
    ? detectedChanges.repositories
    : {};

  if (!accountChanges.some(({ delta }) => delta !== 0)
    && !Object.values(repositoryChanges).some((deltas) => Array.isArray(deltas) && deltas.some(({ delta }) => delta !== 0))) {
    return false;
  }

  pendingActivity.badgeActivity = {
    account: Boolean(pendingActivity.badgeActivity?.account || accountChanges.length > 0),
    repositories: { ...(pendingActivity.badgeActivity?.repositories || {}) },
    updatedAt: checkedAt,
  };

  Object.entries(repositoryChanges).forEach(([repository, deltas]) => {
    if (Array.isArray(deltas) && deltas.some(({ delta }) => delta !== 0)) {
      pendingActivity.badgeActivity.repositories[repository] = true;
    }
  });

  return true;
}

function getSurfaceKey(surface) {
  if (surface === ACTIVITY_SURFACES.QUICK_SUMMARY || surface === 'quickSummary') {
    return 'quickSummary';
  }

  if (surface === ACTIVITY_SURFACES.DASHBOARD) {
    return 'dashboard';
  }

  return '';
}

function createDeliveryToken(surface) {
  return `${surface}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function reclaimStaleInFlightActivity(pendingActivity, nowMs = Date.now()) {
  ['quickSummary', 'dashboard'].forEach((key) => {
    const surface = pendingActivity[key];
    const inFlight = surface?.inFlight;
    const claimedAt = Date.parse(inFlight?.claimedAt || '');

    if (!surface || !inFlight || !Number.isFinite(claimedAt) || nowMs - claimedAt < ACTIVITY_IN_FLIGHT_TIMEOUT_MS) {
      return;
    }

    if (Number(inFlight.account?.followersDelta)) {
      queueAccountDelta(surface.queued, Number(inFlight.account.followersDelta), inFlight.updatedAt || new Date(nowMs).toISOString());
    }

    Object.entries(inFlight.repositories || {}).forEach(([repository, activity]) => {
      REPOSITORY_ACTIVITY_STATS.forEach(({ deltaKey }) => {
        const amount = Number(activity[deltaKey]) || 0;
        if (amount !== 0) {
          queueRepositoryDelta(surface.queued, repository, deltaKey, amount, inFlight.updatedAt || new Date(nowMs).toISOString());
        }
      });
    });

    surface.inFlight = null;
  });

  return pendingActivity;
}

export function claimPendingActivityForSurface(pendingActivity, surface, now = new Date()) {
  const key = getSurfaceKey(surface);

  if (!key) {
    return null;
  }

  reclaimStaleInFlightActivity(pendingActivity, now.getTime());

  if (!pendingActivity[key]) {
    pendingActivity[key] = cloneSurfaceActivity();
  }

  const surfaceState = pendingActivity[key];

  if (surfaceState.inFlight && queueHasActivity(surfaceState.inFlight)) {
    return { token: surfaceState.inFlight.token, activity: cloneActivityQueue(surfaceState.inFlight) };
  }

  if (!queueHasActivity(surfaceState.queued)) {
    return { token: '', activity: createEmptyActivityQueue() };
  }

  const token = createDeliveryToken(surface);
  surfaceState.inFlight = {
    ...cloneActivityQueue(surfaceState.queued),
    token,
    claimedAt: now.toISOString(),
  };
  surfaceState.queued = createEmptyActivityQueue();

  return { token, activity: cloneActivityQueue(surfaceState.inFlight) };
}

function acknowledgeAccountActivity(remaining, displayed) {
  const remainingAmount = Number(remaining.account?.followersDelta) || 0;
  const displayedAmount = Number(displayed?.followersDelta);

  if (remainingAmount !== 0 && Number.isFinite(displayedAmount) && displayedAmount === remainingAmount) {
    remaining.account = {};
    return true;
  }

  return false;
}

function acknowledgeRepositoryMetric(remainingRepositoryActivity, displayedRepositoryActivity, deltaKey) {
  const remainingAmount = Number(remainingRepositoryActivity[deltaKey]) || 0;
  const displayedAmount = Number(displayedRepositoryActivity?.[deltaKey]);

  if (remainingAmount !== 0 && Number.isFinite(displayedAmount) && displayedAmount === remainingAmount) {
    delete remainingRepositoryActivity[deltaKey];
    return true;
  }

  return false;
}

function acknowledgeRepositoryActivity(remaining, repository, displayedRepositoryActivity) {
  const remainingRepositoryActivity = remaining.repositories[repository];

  if (!remainingRepositoryActivity || !displayedRepositoryActivity || typeof displayedRepositoryActivity !== 'object') {
    return;
  }

  let acknowledgedMetric = false;
  REPOSITORY_ACTIVITY_STATS.forEach(({ deltaKey }) => {
    acknowledgedMetric = acknowledgeRepositoryMetric(remainingRepositoryActivity, displayedRepositoryActivity, deltaKey) || acknowledgedMetric;
  });

  if (getRepositoryActivityDeltas(remainingRepositoryActivity).length === 0) {
    delete remaining.repositories[repository];
  }

  return acknowledgedMetric;
}

function getReviewedBadgeRepositories(displayedRepositories, inFlightRepositories) {
  return Object.keys(displayedRepositories || {}).filter((repository) => Boolean(inFlightRepositories?.[repository]));
}

export function acknowledgePendingActivityForSurface(pendingActivity, surface, token, displayed = {}) {
  const key = getSurfaceKey(surface);
  const surfaceState = key ? pendingActivity[key] : null;

  if (!surfaceState?.inFlight || !token || surfaceState.inFlight.token !== token) {
    return { acknowledged: false, reviewedBadgeLocations: { account: false, repositories: [] } };
  }

  const remaining = cloneActivityQueue(surfaceState.inFlight);
  const displayedRepositories = displayed.repositories && typeof displayed.repositories === 'object' ? displayed.repositories : {};
  const reviewedBadgeLocations = {
    account: acknowledgeAccountActivity(remaining, displayed.account),
    repositories: [],
  };

  Object.entries(displayedRepositories).forEach(([repository, displayedRepositoryActivity]) => {
    if (acknowledgeRepositoryActivity(remaining, repository, displayedRepositoryActivity)) {
      reviewedBadgeLocations.repositories.push(repository);
    }
  });

  surfaceState.inFlight = queueHasActivity(remaining)
    ? {
      ...remaining,
      token: surfaceState.inFlight.token,
      claimedAt: surfaceState.inFlight.claimedAt,
    }
    : null;

  clearBadgeLocations(pendingActivity, reviewedBadgeLocations.account, reviewedBadgeLocations.repositories);

  return { acknowledged: true, reviewedBadgeLocations };
}

export function clearBadgeLocations(pendingActivity, account, repositories = []) {
  if (!pendingActivity.badgeActivity) {
    pendingActivity.badgeActivity = { account: false, repositories: {}, updatedAt: '' };
  }

  if (account) {
    pendingActivity.badgeActivity.account = false;
  }

  repositories.forEach((repository) => {
    delete pendingActivity.badgeActivity.repositories?.[repository];
  });

  if (!pendingActivity.badgeActivity.account && Object.keys(pendingActivity.badgeActivity.repositories || {}).length === 0) {
    pendingActivity.badgeActivity.updatedAt = '';
  }
}

export function createDeltaElement(delta, label) {
  const element = document.createElement('span');
  element.className = `activity-delta ${getDeltaClass(delta)}`;
  element.textContent = formatDelta(delta, label);
  return element;
}

export function cleanupShownPendingActivity(pendingActivity) {
  return createEmptyPendingActivity(pendingActivity);
}
