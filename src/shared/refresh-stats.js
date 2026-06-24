import { fetchAuthenticatedAccount, fetchRepositoryMetadata, fetchRepositoryTrafficClones, fetchRepositoryTrafficReferrers, fetchRepositoryTrafficViews } from './github-api.js';
import { getNotificationBaselines, getPendingActivity, normalizeAccountStats, saveAccountStats, saveLatestStats, saveNotificationBaselines, savePendingActivity, saveQuickSummaryStatus } from './storage.js';
import { createEmptyPendingActivity, createEmptyPendingChanges, detectPendingActivityFromStats, mergeBadgeActivity } from './activity.js';

const FULL_REFRESH_FRESHNESS_MS = 60 * 1000;
const FULL_REFRESH_LOCK_STALE_MS = 5 * 60 * 1000;
const FULL_REFRESH_COORDINATION_KEY = 'fullRefreshCoordination';
const MANUAL_REFRESH_SOURCES = new Set(['quick-summary', 'dashboard', 'dashboard-repository', 'manual']);

function getRefreshSource(options) {
  return typeof options?.source === 'string' ? options.source : 'manual';
}

function isManualRefreshSource(source) {
  return MANUAL_REFRESH_SOURCES.has(source);
}

function createRefreshToken(source) {
  return `${source}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function getStorageArea() {
  return chrome.storage.local;
}

function getRefreshCoordination() {
  return new Promise((resolve, reject) => {
    getStorageArea().get({ [FULL_REFRESH_COORDINATION_KEY]: {} }, (stored) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(stored[FULL_REFRESH_COORDINATION_KEY] && typeof stored[FULL_REFRESH_COORDINATION_KEY] === 'object'
        ? stored[FULL_REFRESH_COORDINATION_KEY]
        : {});
    });
  });
}

function saveRefreshCoordination(coordination) {
  return new Promise((resolve, reject) => {
    getStorageArea().set({ [FULL_REFRESH_COORDINATION_KEY]: coordination }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(coordination);
    });
  });
}

function isLockActive(coordination) {
  const startedAt = Date.parse(coordination?.running?.startedAt || '');
  return Boolean(coordination?.running?.token) && Number.isFinite(startedAt) && Date.now() - startedAt < FULL_REFRESH_LOCK_STALE_MS;
}

function isFreshTimestamp(value, freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const timestamp = Date.parse(value || '');
  return Number.isFinite(timestamp) && Date.now() - timestamp < freshnessMs;
}

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function waitForRunningFullRefresh() {
  while (isLockActive(await getRefreshCoordination())) {
    await wait(500);
  }
}

export async function getFullRefreshCoordination() {
  return getRefreshCoordination();
}

export async function getFullRefreshReuseResult(freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const coordination = await getRefreshCoordination();

  if (isLockActive(coordination)) {
    const source = coordination.running.source || '';
    await waitForRunningFullRefresh();
    return { skipped: true, reason: 'completed-recently', source };
  }

  if (isFreshTimestamp(coordination.lastCompletedAt, freshnessMs)) {
    return { skipped: true, reason: 'completed-recently', source: coordination.lastCompletedBy || '' };
  }

  return { skipped: false };
}

export async function isFullRefreshFresh(freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const coordination = await getRefreshCoordination();
  return isFreshTimestamp(coordination.lastCompletedAt, freshnessMs);
}

export async function wasManualFullRefreshRecentlyCompleted(freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const coordination = await getRefreshCoordination();
  return isManualRefreshSource(coordination.lastCompletedBy) && isFreshTimestamp(coordination.lastCompletedAt, freshnessMs);
}

export async function wasManualGitHubRequestRecentlyCompleted(freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const coordination = await getRefreshCoordination();
  return isManualRefreshSource(coordination.lastManualRequestCompletedBy)
    && isFreshTimestamp(coordination.lastManualRequestCompletedAt, freshnessMs);
}

export async function runExclusiveUserVisibleGitHubRequest(source, requestTask) {
  const token = createRefreshToken(source);
  const coordination = await getRefreshCoordination();

  if (isManualRefreshSource(source) && isFreshTimestamp(coordination.lastManualRequestCompletedAt)) {
    return { skipped: true, reason: 'completed-recently', source: coordination.lastManualRequestCompletedBy || '' };
  }

  if (isLockActive(coordination)) {
    const runningSource = coordination.running.source || '';
    await waitForRunningFullRefresh();
    return { skipped: true, reason: 'completed-recently', source: runningSource };
  }

  await saveRefreshCoordination({
    ...coordination,
    running: {
      token,
      source,
      manual: true,
      fullRefresh: false,
      startedAt: new Date().toISOString(),
    },
  });

  const savedCoordination = await getRefreshCoordination();
  if (savedCoordination.running?.token !== token) {
    return { skipped: true, reason: 'running', source: savedCoordination.running?.source || '' };
  }

  try {
    const result = await requestTask();
    const completedAt = result?.fetchedAt || new Date().toISOString();
    const latestCoordination = await getRefreshCoordination();
    if (latestCoordination.running?.token === token) {
      await saveRefreshCoordination({
        ...latestCoordination,
        running: null,
        lastManualRequestCompletedAt: completedAt,
        lastManualRequestCompletedBy: source,
      });
      await saveQuickSummaryStatus({ manualRefreshAt: completedAt });
    }
    return { skipped: false, result };
  } finally {
    const latestCoordination = await getRefreshCoordination();
    if (latestCoordination.running?.token === token) {
      await saveRefreshCoordination({
        ...latestCoordination,
        running: null,
      });
    }
  }
}

export async function runExclusiveFullRefresh(source, refreshTask) {
  const token = createRefreshToken(source);
  const manual = isManualRefreshSource(source);
  const coordination = await getRefreshCoordination();

  if (manual && isFreshTimestamp(coordination.lastManualRequestCompletedAt)) {
    return { skipped: true, reason: 'completed-recently', source: coordination.lastManualRequestCompletedBy || '' };
  }

  if (isLockActive(coordination)) {
    const runningSource = coordination.running.source || '';

    if (manual) {
      await waitForRunningFullRefresh();
      return { skipped: true, reason: 'completed-recently', source: runningSource };
    }

    return { skipped: true, reason: 'running', source: runningSource };
  }

  await saveRefreshCoordination({
    ...coordination,
    running: {
      token,
      source,
      manual,
      fullRefresh: true,
      startedAt: new Date().toISOString(),
    },
  });

  const savedCoordination = await getRefreshCoordination();
  if (savedCoordination.running?.token !== token) {
    return { skipped: true, reason: 'running', source: savedCoordination.running?.source || '' };
  }

  try {
    const result = await refreshTask();
    const completedAt = result?.fetchedAt || new Date().toISOString();
    const latestCoordination = await getRefreshCoordination();
    if (latestCoordination.running?.token === token) {
      await saveRefreshCoordination({
        ...latestCoordination,
        running: null,
        lastCompletedAt: completedAt,
        lastCompletedBy: source,
        lastManualCompletedAt: manual ? completedAt : latestCoordination.lastManualCompletedAt || '',
        lastManualRequestCompletedAt: manual ? completedAt : latestCoordination.lastManualRequestCompletedAt || '',
        lastManualRequestCompletedBy: manual ? source : latestCoordination.lastManualRequestCompletedBy || '',
      });
      if (manual) {
        await saveQuickSummaryStatus({ manualRefreshAt: completedAt });
      }
    }
    return { skipped: false, result };
  } finally {
    const latestCoordination = await getRefreshCoordination();
    if (latestCoordination.running?.token === token) {
      await saveRefreshCoordination({
        ...latestCoordination,
        running: null,
      });
    }
  }
}


function hasFetchedRepositoryNotificationStats(stats) {
  return !stats?.error
    && Number.isFinite(Number(stats?.stars))
    && Number.isFinite(Number(stats?.forks))
    && Number.isFinite(Number(stats?.subscribers));
}

export async function syncNotificationBaselinesFromManualRefresh({ results = [], accountStats, accountError = '', fetchedAt = '' } = {}) {
  const checkedAt = fetchedAt || new Date().toISOString();
  const baselines = await getNotificationBaselines();
  const nextBaselines = {
    ...baselines,
    account: { ...baselines.account },
    repositories: { ...baselines.repositories },
    updatedAt: baselines.updatedAt || checkedAt,
  };
  let changed = false;

  if (!accountError && accountStats?.fetchedAt && Number.isFinite(Number(accountStats.followers))) {
    nextBaselines.account = {
      ...nextBaselines.account,
      login: typeof accountStats.login === 'string' ? accountStats.login : nextBaselines.account.login || '',
      followers: Number(accountStats.followers),
      updatedAt: accountStats.fetchedAt || checkedAt,
    };
    changed = true;
  }

  results.forEach(({ repository, stats }) => {
    if (!repository || !hasFetchedRepositoryNotificationStats(stats)) {
      return;
    }

    nextBaselines.repositories[repository] = {
      ...(nextBaselines.repositories[repository] || {}),
      repository,
      stars: Number(stats.stars),
      forks: Number(stats.forks),
      repoWatchers: Number(stats.subscribers),
      updatedAt: stats.fetchedAt || checkedAt,
    };
    changed = true;
  });

  if (!changed) {
    return baselines;
  }

  nextBaselines.updatedAt = checkedAt;
  return saveNotificationBaselines(nextBaselines);
}

function hasCachedTraffic(stats) {
  return Boolean(stats?.trafficFetchedAt)
    && Number.isFinite(stats.views)
    && Number.isFinite(stats.uniqueVisitors);
}

function hasCachedClones(stats) {
  return Boolean(stats?.clonesFetchedAt) && Number.isFinite(stats.clones);
}

function hasCachedReferrers(stats) {
  return Boolean(stats?.referrersFetchedAt) && Array.isArray(stats.referrers);
}

function notifyProgress(onProgress, progress) {
  if (typeof onProgress !== 'function') {
    return;
  }

  try {
    onProgress(progress);
  } catch (error) {
    // Progress reporting should never interrupt the refresh flow.
  }
}

function getRefreshInputs(settings) {
  const githubToken = typeof settings?.githubToken === 'string' ? settings.githubToken : '';
  const repositories = Array.isArray(settings?.repositories) ? settings.repositories : [];

  if (!githubToken) {
    throw new Error('No token saved. Open Settings and add a GitHub token to refresh stats.');
  }

  if (repositories.length === 0) {
    throw new Error('No repositories configured. Open Settings and add at least one repository.');
  }

  return { githubToken, repositories };
}

async function refreshAccountStats(githubToken, previousAccountStats, fetchedAt) {
  const stats = normalizeAccountStats(previousAccountStats);

  try {
    const account = await fetchAuthenticatedAccount(githubToken);
    const nextStats = { ...stats, ...account, fetchedAt };
    return { accountStats: await saveAccountStats(nextStats), error: '' };
  } catch (error) {
    return { accountStats: stats, error: error.message };
  }
}

async function detectRefreshActivity(settings, previousLatestStats, nextLatestStats, previousAccountStats, nextAccountStats, fetchedAt, repositories, options) {
  const existingPendingActivity = await getPendingActivity();
  const nextPendingActivity = createEmptyPendingActivity(existingPendingActivity);
  const newPendingChanges = createEmptyPendingChanges();
  const pendingChanged = detectPendingActivityFromStats(
    settings,
    previousLatestStats,
    nextLatestStats,
    previousAccountStats,
    nextAccountStats,
    nextPendingActivity,
    fetchedAt,
    repositories,
    newPendingChanges,
  );

  if (!pendingChanged) {
    return existingPendingActivity;
  }

  if (settings.notifications?.badgeEnabled && !options.skipBadgeActivity) {
    mergeBadgeActivity(nextPendingActivity, newPendingChanges, fetchedAt);
  }

  return savePendingActivity(nextPendingActivity);
}

async function refreshRepositoryStats(repository, githubToken, previousStats, fetchedAt) {
  const stats = { ...previousStats, repository };

  try {
    const metadata = await fetchRepositoryMetadata(repository, githubToken);
    Object.assign(stats, metadata, { fetchedAt, error: '' });
  } catch (error) {
    stats.error = error.message;
  }

  try {
    const traffic = await fetchRepositoryTrafficViews(repository, githubToken);
    Object.assign(stats, traffic, { trafficFetchedAt: fetchedAt, trafficError: '' });
  } catch (error) {
    stats.trafficError = error.message;
    if (!hasCachedTraffic(stats)) {
      stats.views = null;
      stats.uniqueVisitors = null;
      stats.dailyViews = [];
      stats.trafficFetchedAt = '';
    }
  }

  try {
    const clones = await fetchRepositoryTrafficClones(repository, githubToken);
    Object.assign(stats, clones, { clonesFetchedAt: fetchedAt, clonesError: '' });
  } catch (error) {
    stats.clonesError = error.message;
    if (!hasCachedClones(stats)) {
      stats.clones = null;
      stats.dailyClones = [];
      stats.clonesFetchedAt = '';
    }
  }

  try {
    const referrers = await fetchRepositoryTrafficReferrers(repository, githubToken);
    Object.assign(stats, referrers, { referrersFetchedAt: fetchedAt, referrersError: '' });
  } catch (error) {
    stats.referrersError = error.message;
    if (!hasCachedReferrers(stats)) {
      stats.referrers = [];
      stats.referrersFetchedAt = '';
    }
  }

  return { repository, stats };
}

export async function refreshStatsCache(settings, currentLatestStats, options = {}) {
  const source = getRefreshSource(options);
  if (!options.skipFullRefreshCoordination) {
    const coordinatedRefresh = await runExclusiveFullRefresh(source, () => refreshStatsCache(settings, currentLatestStats, {
      ...options,
      skipFullRefreshCoordination: true,
    }));

    if (coordinatedRefresh.skipped) {
      return { skipped: true, reason: coordinatedRefresh.reason, source: coordinatedRefresh.source };
    }

    return coordinatedRefresh.result;
  }

  const { githubToken, repositories } = getRefreshInputs(settings);
  const onProgress = options && typeof options === 'object' ? options.onProgress : undefined;
  const previousAccountStats = options && typeof options === 'object' ? options.accountStats : undefined;

  const fetchedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const accountResult = await refreshAccountStats(githubToken, previousAccountStats, fetchedAt);
  let completed = 0;
  const results = await Promise.all(repositories.map(async (repository) => {
    const previousStats = latestStats[repository] || { repository };
    const result = await refreshRepositoryStats(repository, githubToken, previousStats, fetchedAt);

    completed += 1;
    notifyProgress(onProgress, {
      repository,
      completed,
      total: repositories.length,
      result,
    });

    return result;
  }));

  const nextLatestStats = { ...latestStats };
  results.forEach(({ repository, stats }) => {
    nextLatestStats[repository] = stats;
  });

  const pendingActivity = options.detectActivity
    ? await detectRefreshActivity(
      settings,
      latestStats,
      nextLatestStats,
      previousAccountStats,
      accountResult.accountStats,
      fetchedAt,
      repositories,
      options,
    )
    : null;

  const savedLatestStats = await saveLatestStats(nextLatestStats);

  if (isManualRefreshSource(source)) {
    await syncNotificationBaselinesFromManualRefresh({
      results,
      accountStats: accountResult.accountStats,
      accountError: accountResult.error,
      fetchedAt,
    });
  }

  return {
    fetchedAt,
    results,
    latestStats: savedLatestStats,
    accountStats: accountResult.accountStats,
    accountError: accountResult.error,
    pendingActivity,
  };
}

export async function refreshRepositoryStatsCache(settings, currentLatestStats, repository, options = {}) {
  const { githubToken, repositories } = getRefreshInputs(settings);

  if (!repositories.includes(repository)) {
    throw new Error('Repository is not configured. Open Settings and add it before refreshing.');
  }

  const fetchedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const previousStats = latestStats[repository] || { repository };
  const result = await refreshRepositoryStats(repository, githubToken, previousStats, fetchedAt);
  const nextLatestStats = { ...latestStats, [repository]: result.stats };
  const pendingActivity = options.detectActivity
    ? await detectRefreshActivity(
      settings,
      latestStats,
      nextLatestStats,
      undefined,
      undefined,
      fetchedAt,
      [repository],
      options,
    )
    : null;

  const savedLatestStats = await saveLatestStats(nextLatestStats);

  return {
    fetchedAt,
    repository,
    result,
    latestStats: savedLatestStats,
    pendingActivity,
  };
}
