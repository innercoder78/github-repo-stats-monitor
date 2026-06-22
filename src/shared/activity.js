export const ACTIVITY_DELTA_LABELS = Object.freeze({
  starsDelta: 'Star',
  forksDelta: 'Fork',
  repoWatchersDelta: 'Repo Watcher',
  followersDelta: 'Account Follower',
});

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

export function getRepositoryActivityDeltas(activity) {
  if (!activity || typeof activity !== 'object') {
    return [];
  }

  return ['starsDelta', 'forksDelta', 'repoWatchersDelta']
    .map((key) => ({ key, delta: Number(activity[key]) || 0, label: ACTIVITY_DELTA_LABELS[key] }))
    .filter(({ delta }) => delta !== 0);
}

export function createDeltaElement(delta, label) {
  const element = document.createElement('span');
  element.className = `activity-delta ${getDeltaClass(delta)}`;
  element.textContent = formatDelta(delta, label);
  return element;
}

export function cleanupShownPendingActivity(pendingActivity) {
  const nextActivity = {
    account: pendingActivity?.account && typeof pendingActivity.account === 'object'
      ? { ...pendingActivity.account }
      : {},
    repositories: {},
    updatedAt: typeof pendingActivity?.updatedAt === 'string' ? pendingActivity.updatedAt : '',
  };

  if (nextActivity.account.quickSummaryShown) {
    nextActivity.account = {};
  }

  Object.entries(pendingActivity?.repositories || {}).forEach(([repository, activity]) => {
    if (!activity || typeof activity !== 'object') {
      return;
    }

    if (activity.quickSummaryShown && activity.dashboardShown) {
      return;
    }

    nextActivity.repositories[repository] = { ...activity };
  });

  if (Object.keys(nextActivity.account).length === 0 && Object.keys(nextActivity.repositories).length === 0) {
    nextActivity.updatedAt = '';
  }

  return nextActivity;
}
