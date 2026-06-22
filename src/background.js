import { fetchAuthenticatedAccount, fetchRepositoryMetadata } from './shared/github-api.js';
import {
  getNotificationBaselines,
  getPendingActivity,
  getSettings,
  normalizeNotificationSettings,
  saveNotificationBaselines,
  savePendingActivity,
} from './shared/storage.js';

const BACKGROUND_CHECK_ALARM_NAME = 'githubRepoStatsMonitorBackgroundCheck';
const VALID_NOTIFICATION_INTERVALS = Object.freeze([5, 15, 30, 60, 120]);
const REPOSITORY_STATS = Object.freeze([
  { setting: 'stars', baselineKey: 'stars', deltaKey: 'starsDelta', currentKey: 'stars' },
  { setting: 'forks', baselineKey: 'forks', deltaKey: 'forksDelta', currentKey: 'forks' },
  { setting: 'repoWatchers', baselineKey: 'repoWatchers', deltaKey: 'repoWatchersDelta', currentKey: 'subscribers' },
]);

function getSafeInterval(minutes) {
  const interval = Number(minutes);
  return VALID_NOTIFICATION_INTERVALS.includes(interval) ? interval : 30;
}

function hasEnabledTrackedStat(trackedStats) {
  return Boolean(
    trackedStats?.stars
    || trackedStats?.forks
    || trackedStats?.repoWatchers
    || trackedStats?.accountFollowers,
  );
}

function hasEnabledAlertMethod(notifications) {
  return Boolean(notifications?.systemNotificationsEnabled || notifications?.badgeEnabled);
}

function hasRepositoryStatEnabled(trackedStats) {
  return Boolean(trackedStats?.stars || trackedStats?.forks || trackedStats?.repoWatchers);
}

function canRunBackgroundChecks(settings) {
  const notifications = normalizeNotificationSettings(settings?.notifications);

  if (!notifications.backgroundChecksEnabled) {
    return false;
  }

  if (!hasEnabledTrackedStat(notifications.trackedStats)) {
    return false;
  }

  if (!hasEnabledAlertMethod(notifications)) {
    return false;
  }

  if (!settings?.githubToken) {
    return false;
  }

  return Boolean(
    (notifications.trackedStats.accountFollowers)
    || (hasRepositoryStatEnabled(notifications.trackedStats) && settings.repositories.length > 0),
  );
}

async function scheduleBackgroundCheckAlarm() {
  let settings;

  try {
    settings = await getSettings();
  } catch (error) {
    console.warn('Unable to read settings for background checks.', error);
    return;
  }

  if (!canRunBackgroundChecks(settings)) {
    await chrome.alarms.clear(BACKGROUND_CHECK_ALARM_NAME);
    return;
  }

  const interval = getSafeInterval(settings.notifications.checkIntervalMinutes);
  await chrome.alarms.create(BACKGROUND_CHECK_ALARM_NAME, {
    delayInMinutes: interval,
    periodInMinutes: interval,
  });
}

function createEmptyPendingActivity(existingPendingActivity) {
  return {
    account: existingPendingActivity?.account && typeof existingPendingActivity.account === 'object'
      ? { ...existingPendingActivity.account }
      : {},
    repositories: existingPendingActivity?.repositories && typeof existingPendingActivity.repositories === 'object'
      ? { ...existingPendingActivity.repositories }
      : {},
    updatedAt: typeof existingPendingActivity?.updatedAt === 'string' ? existingPendingActivity.updatedAt : '',
  };
}

function applyDelta(value, delta) {
  const nextValue = (Number(value) || 0) + delta;
  return nextValue === 0 ? undefined : nextValue;
}

function recordAccountDelta(pendingActivity, delta) {
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
      quickSummaryShown: Boolean(pendingActivity.account?.quickSummaryShown),
    };
  }

  return true;
}

function recordRepositoryDelta(pendingActivity, repository, deltaKey, delta) {
  if (delta === 0) {
    return false;
  }

  const existingActivity = pendingActivity.repositories[repository] || {};
  const repositoryActivity = {
    ...existingActivity,
    repository,
    quickSummaryShown: Boolean(existingActivity.quickSummaryShown),
    dashboardShown: Boolean(existingActivity.dashboardShown),
  };
  const nextDelta = applyDelta(repositoryActivity[deltaKey], delta);

  if (nextDelta === undefined) {
    delete repositoryActivity[deltaKey];
  } else {
    repositoryActivity[deltaKey] = nextDelta;
  }

  const hasDelta = ['starsDelta', 'forksDelta', 'repoWatchersDelta'].some((key) => Number(repositoryActivity[key]) !== 0);
  if (hasDelta) {
    pendingActivity.repositories[repository] = repositoryActivity;
  } else {
    delete pendingActivity.repositories[repository];
  }

  return true;
}

function cleanupRepositoryStorage(baselines, pendingActivity, repositories) {
  const repositorySet = new Set(repositories);

  Object.keys(baselines.repositories).forEach((repository) => {
    if (!repositorySet.has(repository)) {
      delete baselines.repositories[repository];
    }
  });

  Object.keys(pendingActivity.repositories).forEach((repository) => {
    if (!repositorySet.has(repository)) {
      delete pendingActivity.repositories[repository];
    }
  });
}

async function checkAccountFollowers(settings, baselines, pendingActivity, checkedAt, shouldCompare) {
  if (!settings.notifications.trackedStats.accountFollowers) {
    return false;
  }

  try {
    const account = await fetchAuthenticatedAccount(settings.githubToken);
    const followers = Number(account.followers) || 0;
    const previousFollowers = baselines.account.followers;
    let changed = false;

    if (shouldCompare && Number.isFinite(previousFollowers)) {
      changed = recordAccountDelta(pendingActivity, followers - previousFollowers);
    }

    baselines.account = {
      ...baselines.account,
      login: account.login,
      followers,
      updatedAt: checkedAt,
    };

    return changed;
  } catch (error) {
    console.warn('Unable to check account followers in the background.', error);
    return false;
  }
}

async function checkRepositoryStats(settings, repository, baselines, pendingActivity, checkedAt, shouldCompare) {
  if (!hasRepositoryStatEnabled(settings.notifications.trackedStats)) {
    return false;
  }

  try {
    const metadata = await fetchRepositoryMetadata(repository, settings.githubToken);
    const previousBaseline = baselines.repositories[repository] || {};
    const nextBaseline = { ...previousBaseline, repository, updatedAt: checkedAt };
    let changed = false;

    REPOSITORY_STATS.forEach(({ setting, baselineKey, deltaKey, currentKey }) => {
      if (!settings.notifications.trackedStats[setting]) {
        return;
      }

      const currentValue = Number(metadata[currentKey]) || 0;
      const previousValue = previousBaseline[baselineKey];

      if (shouldCompare && Number.isFinite(previousValue)) {
        changed = recordRepositoryDelta(pendingActivity, repository, deltaKey, currentValue - previousValue) || changed;
      }

      nextBaseline[baselineKey] = currentValue;
    });

    baselines.repositories[repository] = nextBaseline;
    return changed;
  } catch (error) {
    console.warn(`Unable to check ${repository} in the background.`, error);
    return false;
  }
}

async function runBackgroundCheck() {
  let settings;

  try {
    settings = await getSettings();
  } catch (error) {
    console.warn('Unable to read settings for background checks.', error);
    return;
  }

  if (!canRunBackgroundChecks(settings)) {
    await scheduleBackgroundCheckAlarm();
    return;
  }

  const checkedAt = new Date().toISOString();
  const [existingBaselines, existingPendingActivity] = await Promise.all([
    getNotificationBaselines(),
    getPendingActivity(),
  ]);
  const baselines = {
    ...existingBaselines,
    account: { ...existingBaselines.account },
    repositories: { ...existingBaselines.repositories },
  };
  const pendingActivity = createEmptyPendingActivity(existingPendingActivity);
  const shouldCompare = Boolean(baselines.initialized);
  let pendingChanged = false;

  cleanupRepositoryStorage(baselines, pendingActivity, settings.repositories);
  pendingChanged = await checkAccountFollowers(settings, baselines, pendingActivity, checkedAt, shouldCompare) || pendingChanged;

  for (const repository of settings.repositories) {
    pendingChanged = await checkRepositoryStats(settings, repository, baselines, pendingActivity, checkedAt, shouldCompare) || pendingChanged;
  }

  baselines.initialized = true;
  baselines.updatedAt = checkedAt;
  await saveNotificationBaselines(baselines);

  if (pendingChanged) {
    pendingActivity.updatedAt = checkedAt;
  }

  await savePendingActivity(pendingActivity);
}


function wasBackgroundChecksEnabled(change) {
  return Boolean(change?.oldValue?.backgroundChecksEnabled) === false
    && Boolean(change?.newValue?.backgroundChecksEnabled) === true;
}

function getNewlyEnabledTrackedStats(change) {
  const oldStats = change?.oldValue?.trackedStats || {};
  const newStats = change?.newValue?.trackedStats || {};

  return {
    stars: !oldStats.stars && Boolean(newStats.stars),
    forks: !oldStats.forks && Boolean(newStats.forks),
    repoWatchers: !oldStats.repoWatchers && Boolean(newStats.repoWatchers),
    accountFollowers: !oldStats.accountFollowers && Boolean(newStats.accountFollowers),
  };
}

async function resetBaselinesForNextAutomaticCheck() {
  try {
    const baselines = await getNotificationBaselines();
    await saveNotificationBaselines({
      ...baselines,
      account: {},
      repositories: {},
      initialized: false,
      updatedAt: '',
    });
  } catch (error) {
    console.warn('Unable to reset background check baselines.', error);
  }
}

async function resetNewlyEnabledStatBaselines(newlyEnabledStats) {
  if (!Object.values(newlyEnabledStats).some(Boolean)) {
    return;
  }

  try {
    const baselines = await getNotificationBaselines();
    const repositories = { ...baselines.repositories };
    const account = { ...baselines.account };

    if (newlyEnabledStats.accountFollowers) {
      delete account.followers;
      delete account.login;
      delete account.updatedAt;
    }

    Object.keys(repositories).forEach((repository) => {
      const baseline = { ...repositories[repository] };

      if (newlyEnabledStats.stars) {
        delete baseline.stars;
      }

      if (newlyEnabledStats.forks) {
        delete baseline.forks;
      }

      if (newlyEnabledStats.repoWatchers) {
        delete baseline.repoWatchers;
      }

      repositories[repository] = baseline;
    });

    await saveNotificationBaselines({
      ...baselines,
      account,
      repositories,
    });
  } catch (error) {
    console.warn('Unable to reset newly enabled stat baselines.', error);
  }
}

async function handleNotificationSettingsChange(change) {
  if (wasBackgroundChecksEnabled(change)) {
    await resetBaselinesForNextAutomaticCheck();
  } else {
    await resetNewlyEnabledStatBaselines(getNewlyEnabledTrackedStats(change));
  }

  await scheduleBackgroundCheckAlarm();
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleBackgroundCheckAlarm();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleBackgroundCheckAlarm();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  if (changes.notifications) {
    handleNotificationSettingsChange(changes.notifications);
    return;
  }

  if (changes.githubToken || changes.repositories) {
    scheduleBackgroundCheckAlarm();
  }
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name !== BACKGROUND_CHECK_ALARM_NAME) {
    return;
  }

  runBackgroundCheck();
});
