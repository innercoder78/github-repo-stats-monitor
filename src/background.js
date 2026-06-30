import { fetchAuthenticatedAccount, fetchRepositoryMetadata } from './shared/github-api.js';
import { getManualRefreshQuietWindowRemainingMs, runExclusiveFullRefresh } from './shared/refresh-stats.js';
import {
  getAccountStats,
  getLastBackgroundCheckAt,
  getLatestStats,
  getNotificationBaselines,
  getPendingActivity,
  getSettings,
  getViewedBaselines,
  normalizeNotificationSettings,
  saveAccountStats,
  saveLastBackgroundCheckAt,
  saveLatestStats,
  saveNotificationBaselines,
  savePendingActivity,
  saveViewedBaselines,
} from './shared/storage.js';
import { VERSION_CHECK_ALARM_NAME, runVersionCheck } from './shared/version-check.js';

const BACKGROUND_CHECK_ALARM_NAME = 'githubRepoStatsMonitorBackgroundCheck';
const VERSION_CHECK_ALARM_PERIOD_MINUTES = 24 * 60;
const VALID_NOTIFICATION_INTERVALS = Object.freeze([5, 15, 30, 60, 120]);
const REPOSITORY_STATS = Object.freeze([
  { setting: 'stars', baselineKey: 'stars', deltaKey: 'starsDelta', currentKey: 'stars', label: 'Star' },
  { setting: 'forks', baselineKey: 'forks', deltaKey: 'forksDelta', currentKey: 'forks', label: 'Fork' },
  { setting: 'repoWatchers', baselineKey: 'repoWatchers', deltaKey: 'repoWatchersDelta', currentKey: 'subscribers', label: 'Repo Watcher' },
]);
const REPOSITORY_DELTA_LABELS = Object.freeze({
  starsDelta: 'Star',
  forksDelta: 'Fork',
  repoWatchersDelta: 'Repo Watcher',
});
const ACCOUNT_FOLLOWERS_LABEL = 'Account Follower';
const NOTIFICATION_TITLE = 'Changes Detected';
const BADGE_BACKGROUND_COLOR = '#2f81f7';

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


function pluralizeLabel(label, amount) {
  return Math.abs(Number(amount) || 0) === 1 ? label : `${label}s`;
}

function formatDelta(delta, label) {
  const numericDelta = Number(delta) || 0;
  const sign = numericDelta > 0 ? '+' : '-';

  return `${sign}${Math.abs(numericDelta)} ${pluralizeLabel(label, numericDelta)}`;
}

function getRepositoryDeltas(activity) {
  if (!activity || typeof activity !== 'object') {
    return [];
  }

  return Object.entries(REPOSITORY_DELTA_LABELS)
    .map(([deltaKey, label]) => ({ delta: Number(activity[deltaKey]) || 0, label }))
    .filter(({ delta }) => delta !== 0);
}

function countBadgeActivityPlaces(badgeActivity) {
  const accountCount = badgeActivity?.account ? 1 : 0;
  const repositoryCount = Object.values(badgeActivity?.repositories || {})
    .filter(Boolean)
    .length;

  return accountCount + repositoryCount;
}

function getDetectedActivitySummary(changes) {
  const newChanges = changes && typeof changes === 'object' ? changes : { account: [], repositories: {} };
  const accountDeltas = Array.isArray(newChanges.account) ? newChanges.account : [];
  const repositories = newChanges.repositories && typeof newChanges.repositories === 'object'
    ? newChanges.repositories
    : {};
  const changedRepositories = Object.entries(repositories)
    .map(([repository, deltas]) => ({ repository, deltas: Array.isArray(deltas) ? deltas.filter(({ delta }) => delta !== 0) : [] }))
    .filter(({ deltas }) => deltas.length > 0);

  return { accountDeltas: accountDeltas.filter(({ delta }) => delta !== 0), changedRepositories };
}

function hasDetectedActivity(changes) {
  const { accountDeltas, changedRepositories } = getDetectedActivitySummary(changes);
  return accountDeltas.length > 0 || changedRepositories.length > 0;
}

function formatNotificationBody(changes) {
  const { accountDeltas, changedRepositories } = getDetectedActivitySummary(changes);
  const repositoryCount = changedRepositories.length;
  const hasAccountChanges = accountDeltas.length > 0;
  const placeCount = repositoryCount + (hasAccountChanges ? 1 : 0);
  const formattedAccountDeltas = accountDeltas.map(({ delta, label }) => formatDelta(delta, label));

  if (placeCount > 1) {
    const accountSummary = hasAccountChanges && formattedAccountDeltas.length > 0
      ? `, including ${formattedAccountDeltas.join(' and ')}`
      : '';
    const firstRepository = changedRepositories[0];
    const firstRepositoryDelta = firstRepository?.deltas?.find(({ delta }) => delta !== 0);
    const firstChange = firstRepositoryDelta
      ? `${formatDelta(firstRepositoryDelta.delta, firstRepositoryDelta.label)} in ${firstRepository.repository}`
      : formattedAccountDeltas[0];
    return `${firstChange}, with changes in ${placeCount} ${pluralizeLabel('place', placeCount)}${accountSummary}. Open the extension to review them.`;
  }

  if (hasAccountChanges) {
    return `${formattedAccountDeltas.join(' and ')}.`;
  }

  const changedRepository = changedRepositories[0];
  const formattedDeltas = (changedRepository?.deltas || []).map(({ delta, label }) => formatDelta(delta, label));
  const repositoryContext = changedRepository?.repository ? ` in ${changedRepository.repository}` : '';

  return `${formattedDeltas.join(' and ')}${repositoryContext}.`;
}

function createChromeNotification(notificationId, options) {
  return new Promise((resolve, reject) => {
    chrome.notifications.create(notificationId, options, () => {
      const error = chrome.runtime?.lastError;

      if (error) {
        reject(new Error(error.message));
        return;
      }

      resolve();
    });
  });
}

async function showActivityNotification(settings, changes, shouldCompare) {
  if (!shouldCompare
    || !settings.notifications.backgroundChecksEnabled
    || !settings.notifications.systemNotificationsEnabled
    || !hasEnabledTrackedStat(settings.notifications.trackedStats)
    || !hasDetectedActivity(changes)
    || !chrome.notifications?.create) {
    return;
  }

  try {
    const notificationId = `github-repo-stats-monitor-activity-${Date.now()}`;
    await createChromeNotification(notificationId, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('assets/icons/icon-128.png'),
      title: NOTIFICATION_TITLE,
      message: formatNotificationBody(changes),
    });
  } catch (error) {
    console.warn('Unable to show background activity notification. Chrome or OS notification settings may be blocking notifications.', error);
  }
}

async function setBadgeText(text) {
  if (!chrome.action?.setBadgeText) {
    return;
  }

  await chrome.action.setBadgeText({ text });
}

async function updateBadgeFromBadgeActivity(settings, badgeActivity) {
  if (!chrome.action?.setBadgeText) {
    return;
  }

  try {
    if (chrome.action.setBadgeBackgroundColor) {
      await chrome.action.setBadgeBackgroundColor({ color: BADGE_BACKGROUND_COLOR });
    }

    if (!settings.notifications.backgroundChecksEnabled || !settings.notifications.badgeEnabled) {
      await setBadgeText('');
      return;
    }

    const count = countBadgeActivityPlaces(badgeActivity);
    await setBadgeText(count > 0 ? String(count) : '');
  } catch (error) {
    console.warn('Unable to update the extension badge.', error);
  }
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

async function scheduleVersionCheckAlarm() {
  await chrome.alarms.create(VERSION_CHECK_ALARM_NAME, {
    delayInMinutes: VERSION_CHECK_ALARM_PERIOD_MINUTES,
    periodInMinutes: VERSION_CHECK_ALARM_PERIOD_MINUTES,
  });
}

async function attemptVersionCheck() {
  try {
    await runVersionCheck();
  } catch (error) {
    console.warn('Unable to check for extension updates.', error);
  }
}

async function scheduleBackgroundCheckAlarm({ catchUpIfDue = false } = {}) {
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

  if (!catchUpIfDue) {
    await chrome.alarms.create(BACKGROUND_CHECK_ALARM_NAME, {
      delayInMinutes: interval,
      periodInMinutes: interval,
    });
    return;
  }

  let lastBackgroundCheckAt = '';

  try {
    lastBackgroundCheckAt = await getLastBackgroundCheckAt();
  } catch (error) {
    console.warn('Unable to read the last successful background check timestamp.', error);
  }

  const lastCheckTime = Date.parse(lastBackgroundCheckAt);

  if (!Number.isFinite(lastCheckTime)) {
    await chrome.alarms.create(BACKGROUND_CHECK_ALARM_NAME, {
      delayInMinutes: interval,
      periodInMinutes: interval,
    });
    return;
  }

  const elapsedMinutes = Math.max(0, (Date.now() - lastCheckTime) / 60000);

  if (elapsedMinutes >= interval) {
    await chrome.alarms.clear(BACKGROUND_CHECK_ALARM_NAME);
    const checkResult = await runBackgroundCheck();
    const retryAfterMs = Number(checkResult?.retryAfterMs) || 0;
    const delayInMinutes = checkResult?.skipped && checkResult.reason === 'manual-quiet-window' && retryAfterMs > 0
      ? Math.max(retryAfterMs / 60000, 0.5)
      : interval;

    await chrome.alarms.create(BACKGROUND_CHECK_ALARM_NAME, {
      delayInMinutes,
      periodInMinutes: interval,
    });
    return;
  }

  await chrome.alarms.create(BACKGROUND_CHECK_ALARM_NAME, {
    delayInMinutes: interval - elapsedMinutes,
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

function recordAccountDelta(pendingActivity, delta, detectedChanges) {
  if (delta === 0) {
    return false;
  }

  if (detectedChanges) {
    detectedChanges.account.push({ delta, label: ACCOUNT_FOLLOWERS_LABEL });
  }

  const followersDelta = applyDelta(pendingActivity.account?.followersDelta, delta);

  if (followersDelta === undefined) {
    pendingActivity.account = {};
  } else {
    pendingActivity.account = {
      ...pendingActivity.account,
      followersDelta,
      quickSummaryShown: false,
      dashboardShown: false,
    };
  }

  return true;
}

function recordRepositoryDelta(pendingActivity, repository, deltaKey, delta, label, detectedChanges) {
  if (delta === 0) {
    return false;
  }

  if (detectedChanges) {
    if (!detectedChanges.repositories[repository]) {
      detectedChanges.repositories[repository] = [];
    }

    detectedChanges.repositories[repository].push({ delta, label });
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

  const hasDelta = ['starsDelta', 'forksDelta', 'repoWatchersDelta'].some((key) => Number(repositoryActivity[key]) !== 0);
  if (hasDelta) {
    pendingActivity.repositories[repository] = repositoryActivity;
  } else {
    delete pendingActivity.repositories[repository];
  }

  return true;
}


function mergeBadgeActivity(pendingActivity, detectedChanges, checkedAt) {
  if (!hasDetectedActivity(detectedChanges)) {
    return false;
  }

  pendingActivity.badgeActivity = {
    account: Boolean(pendingActivity.badgeActivity?.account || detectedChanges.account.length > 0),
    repositories: { ...(pendingActivity.badgeActivity?.repositories || {}) },
    updatedAt: checkedAt,
  };

  Object.entries(detectedChanges.repositories || {}).forEach(([repository, deltas]) => {
    if (Array.isArray(deltas) && deltas.some(({ delta }) => delta !== 0)) {
      pendingActivity.badgeActivity.repositories[repository] = true;
    }
  });

  return true;
}

function cleanupRepositoryStorage(baselines, pendingActivity, repositories) {
  const repositorySet = new Set(repositories);
  let baselinesChanged = false;
  let pendingActivityChanged = false;

  Object.keys(baselines.repositories).forEach((repository) => {
    if (!repositorySet.has(repository)) {
      delete baselines.repositories[repository];
      baselinesChanged = true;
    }
  });

  Object.keys(pendingActivity.repositories).forEach((repository) => {
    if (!repositorySet.has(repository)) {
      delete pendingActivity.repositories[repository];
      pendingActivityChanged = true;
    }
  });

  Object.keys(pendingActivity.badgeActivity?.repositories || {}).forEach((repository) => {
    if (!repositorySet.has(repository)) {
      delete pendingActivity.badgeActivity.repositories[repository];
      pendingActivityChanged = true;
    }
  });

  return { baselinesChanged, pendingActivityChanged };
}


function hasFetchedNumber(value) {
  return Number.isFinite(Number(value));
}

async function mergeFetchedAccountFollowersIntoCachedStats(account, checkedAt) {
  if (!hasFetchedNumber(account?.followers)) {
    return null;
  }

  const existingAccountStats = await getAccountStats();
  return saveAccountStats({
    ...existingAccountStats,
    login: typeof account.login === 'string' ? account.login : existingAccountStats.login,
    followers: Number(account.followers),
    fetchedAt: checkedAt,
  });
}

function createFetchedRepositoryMetadataStatsPatch(repository, metadata, checkedAt) {
  const metadataFields = [
    ['stars', metadata?.stars],
    ['forks', metadata?.forks],
    ['subscribers', metadata?.subscribers],
  ].filter(([, value]) => hasFetchedNumber(value));

  if (metadataFields.length === 0) {
    return null;
  }

  return {
    repository,
    updates: Object.fromEntries([
      ...metadataFields.map(([key, value]) => [key, Number(value)]),
      ['fetchedAt', checkedAt],
      ['error', ''],
    ]),
  };
}

function mergeRepositoryMetadataStatsPatches(latestStats, metadataPatches) {
  return metadataPatches.reduce((nextLatestStats, { repository, updates }) => {
    nextLatestStats[repository] = {
      ...(nextLatestStats[repository] || { repository }),
      repository,
      ...updates,
    };

    return nextLatestStats;
  }, { ...latestStats });
}

async function checkAccountFollowers(settings, baselines, pendingActivity, checkedAt, shouldCompare, detectedChanges) {
  if (!settings.notifications.trackedStats.accountFollowers) {
    return { checked: false, changed: false };
  }

  try {
    const account = await fetchAuthenticatedAccount(settings.githubToken);
    if (!hasFetchedNumber(account.followers)) {
      return { checked: false, changed: false };
    }

    const followers = Number(account.followers);
    const previousFollowers = baselines.account.followers;
    const previousLogin = typeof baselines.account.login === 'string' ? baselines.account.login : '';
    const fetchedLogin = typeof account.login === 'string' ? account.login : '';
    const accountLoginChanged = Boolean(previousLogin && fetchedLogin && previousLogin !== fetchedLogin);
    let changed = false;

    if (shouldCompare && Number.isFinite(previousFollowers) && !accountLoginChanged) {
      changed = recordAccountDelta(pendingActivity, followers - previousFollowers, detectedChanges);
    }

    baselines.account = {
      ...baselines.account,
      login: account.login,
      followers,
      updatedAt: checkedAt,
    };
    await mergeFetchedAccountFollowersIntoCachedStats(account, checkedAt);

    return { checked: true, changed };
  } catch (error) {
    console.warn('Unable to check account followers in the background.', error);
    return { checked: false, changed: false };
  }
}

async function checkRepositoryStats(settings, repository, baselines, pendingActivity, checkedAt, shouldCompare, detectedChanges) {
  if (!hasRepositoryStatEnabled(settings.notifications.trackedStats)) {
    return { checked: false, changed: false };
  }

  try {
    const metadata = await fetchRepositoryMetadata(repository, settings.githubToken);
    const previousBaseline = baselines.repositories[repository] || {};
    const nextBaseline = { ...previousBaseline, repository, updatedAt: checkedAt };
    let changed = false;

    let checked = false;

    REPOSITORY_STATS.forEach(({ setting, baselineKey, deltaKey, currentKey, label }) => {
      if (!settings.notifications.trackedStats[setting]) {
        return;
      }

      if (!hasFetchedNumber(metadata[currentKey])) {
        return;
      }

      checked = true;
      const currentValue = Number(metadata[currentKey]);
      const previousValue = previousBaseline[baselineKey];

      if (shouldCompare && Number.isFinite(previousValue)) {
        changed = recordRepositoryDelta(pendingActivity, repository, deltaKey, currentValue - previousValue, label, detectedChanges) || changed;
      }

      nextBaseline[baselineKey] = currentValue;
    });

    if (!checked) {
      return { checked: false, changed: false };
    }

    baselines.repositories[repository] = nextBaseline;
    return {
      checked: true,
      changed,
      metadataPatch: createFetchedRepositoryMetadataStatsPatch(repository, metadata, checkedAt),
    };
  } catch (error) {
    console.warn(`Unable to check ${repository} in the background.`, error);
    return { checked: false, changed: false };
  }
}

async function runBackgroundCheck() {
  const manualQuietWindowRemainingMs = await getManualRefreshQuietWindowRemainingMs();
  if (manualQuietWindowRemainingMs > 0) {
    return { skipped: true, reason: 'manual-quiet-window', retryAfterMs: manualQuietWindowRemainingMs };
  }

  const coordinatedCheck = await runExclusiveFullRefresh('background', runBackgroundCheckNow);
  if (coordinatedCheck.skipped) {
    return { skipped: true, reason: coordinatedCheck.reason || 'running' };
  }

  return { skipped: false };
}

async function runBackgroundCheckNow() {
  let settings;

  try {
    settings = await getSettings();
  } catch (error) {
    console.warn('Unable to read settings for background checks.', error);
    return;
  }

  if (!canRunBackgroundChecks(settings)) {
    await updateBadgeFromBadgeActivity(settings, { account: false, repositories: {} });
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
  let hadSuccessfulCheck = false;
  let baselinesChanged = false;
  const repositoryMetadataPatches = [];
  // Keep the raw deltas from this background check separate from the net pending
  // activity that Quick Summary and Dashboard display. A raw +1 should still
  // alert even when it cancels an older unresolved -1 in pending activity.
  const detectedChanges = { account: [], repositories: {} };

  const cleanupResult = cleanupRepositoryStorage(baselines, pendingActivity, settings.repositories);
  baselinesChanged = cleanupResult.baselinesChanged || baselinesChanged;
  pendingChanged = cleanupResult.pendingActivityChanged || pendingChanged;
  const accountResult = await checkAccountFollowers(settings, baselines, pendingActivity, checkedAt, shouldCompare, detectedChanges);
  hadSuccessfulCheck = accountResult.checked || hadSuccessfulCheck;
  pendingChanged = accountResult.changed || pendingChanged;

  for (const repository of settings.repositories) {
    const repositoryResult = await checkRepositoryStats(settings, repository, baselines, pendingActivity, checkedAt, shouldCompare, detectedChanges);
    hadSuccessfulCheck = repositoryResult.checked || hadSuccessfulCheck;
    pendingChanged = repositoryResult.changed || pendingChanged;

    if (repositoryResult.metadataPatch) {
      repositoryMetadataPatches.push(repositoryResult.metadataPatch);
    }
  }

  if (repositoryMetadataPatches.length > 0) {
    const latestStats = await getLatestStats();
    await saveLatestStats(mergeRepositoryMetadataStatsPatches(latestStats, repositoryMetadataPatches));
  }

  if (hadSuccessfulCheck) {
    baselines.initialized = true;
    baselines.updatedAt = checkedAt;
    await saveNotificationBaselines(baselines);
  } else if (baselinesChanged) {
    await saveNotificationBaselines(baselines);
  }

  if (pendingChanged) {
    pendingActivity.updatedAt = checkedAt;

    if (settings.notifications.badgeEnabled) {
      pendingChanged = mergeBadgeActivity(pendingActivity, detectedChanges, checkedAt) || pendingChanged;
    }
  }

  let badgeActivity = pendingActivity.badgeActivity;

  if (pendingChanged) {
    const savedPendingActivity = await savePendingActivity(pendingActivity);
    badgeActivity = savedPendingActivity.badgeActivity;
  }

  if (hasDetectedActivity(detectedChanges)) {
    await updateBadgeFromBadgeActivity(settings, badgeActivity);
  }
  await showActivityNotification(settings, detectedChanges, shouldCompare);

  if (hadSuccessfulCheck) {
    await saveLastBackgroundCheckAt(checkedAt);
  }

  return { fetchedAt: checkedAt };
}


function removeUnconfiguredRepositoryEntries(repositoryEntries, repositorySet) {
  const nextEntries = {};
  let changed = false;

  Object.entries(repositoryEntries || {}).forEach(([repository, value]) => {
    if (repositorySet.has(repository)) {
      nextEntries[repository] = value;
    } else {
      changed = true;
    }
  });

  return { entries: nextEntries, changed };
}

async function cleanupRemovedRepositoryStorage(repositories) {
  const repositorySet = new Set(Array.isArray(repositories) ? repositories : []);

  try {
    const [settings, latestStats, pendingActivity, viewedBaselines, notificationBaselines] = await Promise.all([
      getSettings(),
      getLatestStats(),
      getPendingActivity(),
      getViewedBaselines(),
      getNotificationBaselines(),
    ]);
    const latestStatsCleanup = removeUnconfiguredRepositoryEntries(latestStats, repositorySet);
    const pendingRepositoriesCleanup = removeUnconfiguredRepositoryEntries(pendingActivity.repositories, repositorySet);
    const pendingBadgeRepositoriesCleanup = removeUnconfiguredRepositoryEntries(pendingActivity.badgeActivity?.repositories, repositorySet);
    const viewedBaselinesCleanup = removeUnconfiguredRepositoryEntries(viewedBaselines.repositories, repositorySet);
    const notificationBaselinesCleanup = removeUnconfiguredRepositoryEntries(notificationBaselines.repositories, repositorySet);
    const nextPendingActivity = createEmptyPendingActivity(pendingActivity);
    const cleanupTasks = [];

    if (latestStatsCleanup.changed) {
      cleanupTasks.push(saveLatestStats(latestStatsCleanup.entries));
    }

    if (pendingRepositoriesCleanup.changed || pendingBadgeRepositoriesCleanup.changed) {
      nextPendingActivity.repositories = pendingRepositoriesCleanup.entries;
      nextPendingActivity.badgeActivity = {
        ...(nextPendingActivity.badgeActivity || {}),
        repositories: pendingBadgeRepositoriesCleanup.entries,
      };
      cleanupTasks.push(savePendingActivity(nextPendingActivity));
    }

    if (viewedBaselinesCleanup.changed) {
      cleanupTasks.push(saveViewedBaselines({
        ...viewedBaselines,
        repositories: viewedBaselinesCleanup.entries,
      }));
    }

    if (notificationBaselinesCleanup.changed) {
      cleanupTasks.push(saveNotificationBaselines({
        ...notificationBaselines,
        repositories: notificationBaselinesCleanup.entries,
      }));
    }

    await Promise.all(cleanupTasks);

    if (pendingRepositoriesCleanup.changed || pendingBadgeRepositoriesCleanup.changed) {
      await updateBadgeFromBadgeActivity(settings, nextPendingActivity.badgeActivity);
    }
  } catch (error) {
    console.warn('Unable to clean up removed repository activity.', error);
  }
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

async function resetAccountStateForTokenChange() {
  try {
    const [settings, pendingActivity, viewedBaselines, notificationBaselines] = await Promise.all([
      getSettings(),
      getPendingActivity(),
      getViewedBaselines(),
      getNotificationBaselines(),
    ]);
    const nextPendingActivity = {
      ...pendingActivity,
      account: {},
      badgeActivity: {
        ...(pendingActivity.badgeActivity || {}),
        account: false,
        repositories: { ...(pendingActivity.badgeActivity?.repositories || {}) },
      },
    };

    await Promise.all([
      saveAccountStats({}),
      savePendingActivity(nextPendingActivity),
      saveViewedBaselines({
        ...viewedBaselines,
        account: {},
      }),
      saveNotificationBaselines({
        ...notificationBaselines,
        account: {},
      }),
    ]);
    await updateBadgeFromBadgeActivity(settings, nextPendingActivity.badgeActivity);
  } catch (error) {
    console.warn('Unable to reset account state after token changed.', error);
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

async function handleNotificationSettingsChange(change, { scheduleAlarm = true } = {}) {
  const nextNotifications = normalizeNotificationSettings(change?.newValue);
  const settings = { ...(await getSettings()), notifications: nextNotifications };

  if (wasBackgroundChecksEnabled(change)) {
    await resetBaselinesForNextAutomaticCheck();
  } else {
    await resetNewlyEnabledStatBaselines(getNewlyEnabledTrackedStats(change));
  }

  if (scheduleAlarm) {
    await scheduleBackgroundCheckAlarm();
  }

  try {
    if (!settings.notifications.backgroundChecksEnabled || !settings.notifications.badgeEnabled) {
      const pendingActivity = await getPendingActivity();

      await savePendingActivity({
        ...pendingActivity,
        badgeActivity: { account: false, repositories: {}, updatedAt: '' },
      });
      await updateBadgeFromBadgeActivity(settings, { account: false, repositories: {} });
    }
  } catch (error) {
    console.warn('Unable to update badge after notification settings changed.', error);
  }
}

chrome.runtime.onInstalled.addListener(() => {
  scheduleBackgroundCheckAlarm();
  scheduleVersionCheckAlarm();
  attemptVersionCheck();
});

chrome.runtime.onStartup.addListener(() => {
  scheduleBackgroundCheckAlarm({ catchUpIfDue: true });
  scheduleVersionCheckAlarm();
  attemptVersionCheck();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') {
    return;
  }

  const hasRelevantChange = Boolean(
    changes.notifications || changes.githubToken || changes.repositories,
  );

  if (!hasRelevantChange) {
    return;
  }

  (async () => {
    if (changes.notifications) {
      await handleNotificationSettingsChange(changes.notifications, { scheduleAlarm: false });
    }

    if (changes.githubToken) {
      await resetAccountStateForTokenChange();
    }

    if (changes.repositories) {
      await cleanupRemovedRepositoryStorage(changes.repositories.newValue);
    }

    await scheduleBackgroundCheckAlarm();
  })().catch((error) => {
    console.warn('Unable to handle storage changes in the background.', error);
  });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === BACKGROUND_CHECK_ALARM_NAME) {
    runBackgroundCheck();
    return;
  }

  if (alarm.name === VERSION_CHECK_ALARM_NAME) {
    attemptVersionCheck();
  }
});
