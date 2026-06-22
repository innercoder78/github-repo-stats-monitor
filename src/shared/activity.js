export const ACTIVITY_DELTA_LABELS = Object.freeze({
  starsDelta: 'Star',
  forksDelta: 'Fork',
  repoWatchersDelta: 'Repo Watcher',
  followersDelta: 'Account Follower',
});

const REPOSITORY_ACTIVITY_STATS = Object.freeze([
  { setting: 'stars', deltaKey: 'starsDelta', previousKey: 'stars', currentKey: 'stars', label: ACTIVITY_DELTA_LABELS.starsDelta },
  { setting: 'forks', deltaKey: 'forksDelta', previousKey: 'forks', currentKey: 'forks', label: ACTIVITY_DELTA_LABELS.forksDelta },
  { setting: 'repoWatchers', deltaKey: 'repoWatchersDelta', previousKey: 'subscribers', currentKey: 'subscribers', label: ACTIVITY_DELTA_LABELS.repoWatchersDelta },
]);

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

function hasAccountFollowersBaseline(accountStats) {
  return Boolean(accountStats?.fetchedAt) && hasTrackedStatBaseline(accountStats, 'followers');
}

export function getRepositoryActivityDeltas(activity) {
  if (!activity || typeof activity !== 'object') {
    return [];
  }

  return REPOSITORY_ACTIVITY_STATS
    .map(({ deltaKey, label }) => ({ key: deltaKey, delta: Number(activity[deltaKey]) || 0, label }))
    .filter(({ delta }) => delta !== 0);
}

export function createEmptyPendingActivity(existingPendingActivity) {
  return {
    account: existingPendingActivity?.account && typeof existingPendingActivity.account === 'object'
      ? { ...existingPendingActivity.account }
      : {},
    repositories: existingPendingActivity?.repositories && typeof existingPendingActivity.repositories === 'object'
      ? { ...existingPendingActivity.repositories }
      : {},
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

export function recordAccountActivityDelta(pendingActivity, delta, newPendingChanges) {
  if (delta === 0) {
    return false;
  }

  const followersDelta = applyDelta(pendingActivity.account?.followersDelta, delta);

  if (followersDelta === undefined) {
    pendingActivity.account = {};
  } else {
    pendingActivity.account = {
      ...pendingActivity.account,
      followersDelta,
      quickSummaryShown: false,
    };
  }

  if (newPendingChanges && followersDelta !== undefined) {
    newPendingChanges.account.push({ delta, label: ACTIVITY_DELTA_LABELS.followersDelta });
  }

  return true;
}

export function recordRepositoryActivityDelta(pendingActivity, repository, deltaKey, delta, label, newPendingChanges) {
  if (delta === 0) {
    return false;
  }

  const existingActivity = pendingActivity.repositories[repository] || {};
  const repositoryActivity = {
    ...existingActivity,
    repository,
    quickSummaryShown: false,
    dashboardShown: false,
  };
  const nextDelta = applyDelta(repositoryActivity[deltaKey], delta);

  if (nextDelta === undefined) {
    delete repositoryActivity[deltaKey];
  } else {
    repositoryActivity[deltaKey] = nextDelta;
  }

  const hasDelta = REPOSITORY_ACTIVITY_STATS.some(({ deltaKey: key }) => Number(repositoryActivity[key]) !== 0);
  if (hasDelta) {
    pendingActivity.repositories[repository] = repositoryActivity;
  } else {
    delete pendingActivity.repositories[repository];
  }

  if (newPendingChanges && nextDelta !== undefined) {
    if (!newPendingChanges.repositories[repository]) {
      newPendingChanges.repositories[repository] = [];
    }

    newPendingChanges.repositories[repository].push({ delta, label });
  }

  return true;
}

export function detectPendingActivityFromStats(settings, previousLatestStats, nextLatestStats, previousAccountStats, nextAccountStats, pendingActivity, checkedAt, repositories, newPendingChanges) {
  const trackedStats = getTrackedStats(settings);
  let changed = false;

  if (trackedStats.accountFollowers) {
    const previousFollowers = Number(previousAccountStats?.followers);
    const nextFollowers = Number(nextAccountStats?.followers);

    if (hasAccountFollowersBaseline(previousAccountStats) && Number.isFinite(nextFollowers)) {
      changed = recordAccountActivityDelta(pendingActivity, nextFollowers - previousFollowers, newPendingChanges) || changed;
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
        changed = recordRepositoryActivityDelta(pendingActivity, repository, deltaKey, nextValue - previousValue, label, newPendingChanges) || changed;
      }
    });
  });

  if (changed) {
    pendingActivity.updatedAt = checkedAt;
  }

  return changed;
}

export function mergeBadgeActivity(pendingActivity, newPendingChanges, checkedAt) {
  const accountChanges = Array.isArray(newPendingChanges?.account) ? newPendingChanges.account : [];
  const repositoryChanges = newPendingChanges?.repositories && typeof newPendingChanges.repositories === 'object'
    ? newPendingChanges.repositories
    : {};

  if (!accountChanges.some(({ delta }) => delta !== 0)
    && !Object.values(repositoryChanges).some((deltas) => Array.isArray(deltas) && deltas.some(({ delta }) => delta !== 0))) {
    return;
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
}

export function createDeltaElement(delta, label) {
  const element = document.createElement('span');
  element.className = `activity-delta ${getDeltaClass(delta)}`;
  element.textContent = formatDelta(delta, label);
  return element;
}

export function cleanupShownPendingActivity(pendingActivity) {
  const nextActivity = createEmptyPendingActivity(pendingActivity);

  if (nextActivity.account.quickSummaryShown) {
    nextActivity.account = {};
  }

  Object.entries(pendingActivity?.repositories || {}).forEach(([repository, activity]) => {
    if (!activity || typeof activity !== 'object') {
      return;
    }

    if (activity.quickSummaryShown && activity.dashboardShown) {
      delete nextActivity.repositories[repository];
    }
  });

  if (Object.keys(nextActivity.account).length === 0 && Object.keys(nextActivity.repositories).length === 0) {
    nextActivity.updatedAt = '';
  }

  return nextActivity;
}
