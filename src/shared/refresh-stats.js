import { fetchAuthenticatedAccount, fetchRepositoryMetadata, fetchRepositoryTrafficClones, fetchRepositoryTrafficReferrers, fetchRepositoryTrafficViews } from './github-api.js';
import { getNotificationBaselines, normalizeAccountStats, normalizeRepositoryName, saveAccountStats, mergeLatestStats, saveNotificationBaselines, saveQuickSummaryStatus } from './storage.js';
import { createEmptyPendingActivity, createEmptyPendingChanges, detectPendingActivityFromStats } from './activity.js';
import { runTrackedGitHubActivity } from './github-activity.js';

const FULL_REFRESH_FRESHNESS_MS = 60 * 1000;
const FULL_REFRESH_LOCK_STALE_MS = 5 * 60 * 1000;
const REPOSITORY_REFRESH_LOCK_STALE_MS = 5 * 60 * 1000;
const FULL_REFRESH_COORDINATION_KEY = 'fullRefreshCoordination';
const MANUAL_REFRESH_SOURCES = new Set(['quick-summary', 'dashboard', 'dashboard-repository', 'manual']);

const REPOSITORY_REQUEST_CONCURRENCY_LIMIT = 4;

export async function mapWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  const concurrency = Math.max(1, Math.min(Number(limit) || 1, items.length));
  let nextIndex = 0;

  async function runNext() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: concurrency }, runNext));
  return results;
}

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

function getFreshTimestampRemainingMs(value, freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const timestamp = Date.parse(value || '');
  if (!Number.isFinite(timestamp)) {
    return 0;
  }

  return Math.max(0, freshnessMs - (Date.now() - timestamp));
}

function getRecentCompletedRepositoryRefreshes(coordination, freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const completedRepositoryRefreshes = coordination?.completedRepositoryRefreshes && typeof coordination.completedRepositoryRefreshes === 'object'
    ? coordination.completedRepositoryRefreshes
    : {};
  const recentRefreshes = {};

  Object.entries(completedRepositoryRefreshes).forEach(([repository, refresh]) => {
    const normalizedRepository = normalizeRepositoryName(repository || refresh?.repository);
    if (normalizedRepository && isFreshTimestamp(refresh?.completedAt, freshnessMs)) {
      recentRefreshes[normalizedRepository] = {
        repository: normalizedRepository,
        completedAt: refresh.completedAt,
        source: refresh.source || 'dashboard-repository',
      };
    }
  });

  const legacyRepository = normalizeRepositoryName(coordination?.lastRepositoryRequestCompletedRepository);
  if (legacyRepository && isFreshTimestamp(coordination?.lastRepositoryRequestCompletedAt, freshnessMs)) {
    recentRefreshes[legacyRepository] = {
      repository: legacyRepository,
      completedAt: coordination.lastRepositoryRequestCompletedAt,
      source: coordination.lastRepositoryRequestCompletedBy || 'dashboard-repository',
    };
  }

  return recentRefreshes;
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

export async function getManualRefreshQuietWindowRemainingMs(freshnessMs = FULL_REFRESH_FRESHNESS_MS) {
  const coordination = await getRefreshCoordination();
  const completedRemainingMs = isManualRefreshSource(coordination.lastCompletedBy)
    ? getFreshTimestampRemainingMs(coordination.lastCompletedAt, freshnessMs)
    : 0;
  const manualRequestRemainingMs = isManualRefreshSource(coordination.lastManualRequestCompletedBy)
    ? getFreshTimestampRemainingMs(coordination.lastManualRequestCompletedAt, freshnessMs)
    : 0;

  return Math.max(completedRemainingMs, manualRequestRemainingMs);
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
    const result = await runTrackedGitHubActivity(source, requestTask);
    const completedAt = new Date().toISOString();
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


function getActiveRepositoryRefreshes(coordination) {
  const repositoryRefreshes = coordination?.repositoryRefreshes && typeof coordination.repositoryRefreshes === 'object'
    ? coordination.repositoryRefreshes
    : {};
  const now = Date.now();

  return Object.fromEntries(Object.entries(repositoryRefreshes).filter(([, refresh]) => {
    const startedAt = Date.parse(refresh?.startedAt || '');
    return Boolean(refresh?.token) && Number.isFinite(startedAt) && now - startedAt < REPOSITORY_REFRESH_LOCK_STALE_MS;
  }));
}

export async function runExclusiveRepositoryRefresh(repository, requestTask) {
  const normalizedRepository = normalizeRepositoryName(repository);

  if (!normalizedRepository) {
    return { skipped: true, reason: 'invalid-repository', source: 'dashboard-repository' };
  }

  const source = 'dashboard-repository';
  const token = createRefreshToken(`${source}-${normalizedRepository}`);
  const coordination = await getRefreshCoordination();
  const repositoryRefreshes = getActiveRepositoryRefreshes(coordination);

  if (repositoryRefreshes[normalizedRepository]) {
    return { skipped: true, reason: 'running', source, repository: normalizedRepository };
  }

  await saveRefreshCoordination({
    ...coordination,
    repositoryRefreshes: {
      ...repositoryRefreshes,
      [normalizedRepository]: {
        token,
        source,
        repository: normalizedRepository,
        startedAt: new Date().toISOString(),
      },
    },
  });

  const savedCoordination = await getRefreshCoordination();
  const savedRepositoryRefreshes = getActiveRepositoryRefreshes(savedCoordination);
  if (savedRepositoryRefreshes[normalizedRepository]?.token !== token) {
    return { skipped: true, reason: 'running', source, repository: normalizedRepository };
  }

  try {
    const result = await runTrackedGitHubActivity(source, requestTask);
    const completedAt = new Date().toISOString();
    const latestCoordination = await getRefreshCoordination();
    const latestRepositoryRefreshes = getActiveRepositoryRefreshes(latestCoordination);

    if (latestRepositoryRefreshes[normalizedRepository]?.token === token) {
      delete latestRepositoryRefreshes[normalizedRepository];
      await saveRefreshCoordination({
        ...latestCoordination,
        repositoryRefreshes: latestRepositoryRefreshes,
        completedRepositoryRefreshes: {
          ...getRecentCompletedRepositoryRefreshes(latestCoordination),
          [normalizedRepository]: {
            repository: normalizedRepository,
            source,
            completedAt,
          },
        },
        lastRepositoryRequestCompletedAt: completedAt,
        lastRepositoryRequestCompletedBy: source,
        lastRepositoryRequestCompletedRepository: normalizedRepository,
      });
      await saveQuickSummaryStatus({ manualRefreshAt: completedAt });
    }

    return { skipped: false, result };
  } finally {
    const latestCoordination = await getRefreshCoordination();
    const latestRepositoryRefreshes = getActiveRepositoryRefreshes(latestCoordination);

    if (latestRepositoryRefreshes[normalizedRepository]?.token === token) {
      delete latestRepositoryRefreshes[normalizedRepository];
      await saveRefreshCoordination({
        ...latestCoordination,
        repositoryRefreshes: latestRepositoryRefreshes,
      });
    }
  }
}

export async function runExclusiveFullRefresh(source, refreshTask) {
  const token = createRefreshToken(source);
  const manual = isManualRefreshSource(source);
  const coordination = await getRefreshCoordination();

  if (manual && isFreshTimestamp(coordination.lastCompletedAt)) {
    return { skipped: true, reason: 'completed-recently', source: coordination.lastCompletedBy || '' };
  }

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
    const result = await runTrackedGitHubActivity(source, refreshTask);
    const completedAt = new Date().toISOString();
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

  nextBaselines.initialized = true;
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

async function refreshAccountStats(githubToken, previousAccountStats) {
  const stats = normalizeAccountStats(previousAccountStats);

  try {
    const account = await fetchAuthenticatedAccount(githubToken);
    const nextStats = { ...stats, ...account, fetchedAt: new Date().toISOString() };
    return { accountStats: await saveAccountStats(nextStats), error: '' };
  } catch (error) {
    return { accountStats: stats, error: error.message };
  }
}

async function detectRefreshActivity(settings, previousLatestStats, nextLatestStats, previousAccountStats, nextAccountStats, fetchedAt, repositories, options) {
  const detectedActivity = createEmptyPendingActivity();
  const newPendingChanges = createEmptyPendingChanges();
  const pendingChanged = detectPendingActivityFromStats(
    settings,
    previousLatestStats,
    nextLatestStats,
    previousAccountStats,
    nextAccountStats,
    detectedActivity,
    fetchedAt,
    repositories,
    newPendingChanges,
  );

  if (!pendingChanged) {
    return null;
  }

  if (typeof options.applyPendingActivityChanges === 'function') {
    return options.applyPendingActivityChanges({
      detectedChanges: newPendingChanges,
      checkedAt: fetchedAt,
      includeBadgeActivity: Boolean(settings.notifications?.badgeEnabled && !options.skipBadgeActivity),
    });
  }

  return detectedActivity;
}

async function refreshRepositoryStats(repository, githubToken, previousStats) {
  const stats = { ...previousStats, repository };

  try {
    const metadata = await fetchRepositoryMetadata(repository, githubToken);
    Object.assign(stats, metadata, { fetchedAt: new Date().toISOString(), error: '' });
  } catch (error) {
    stats.error = error.message;
  }

  try {
    const traffic = await fetchRepositoryTrafficViews(repository, githubToken);
    Object.assign(stats, traffic, { trafficFetchedAt: new Date().toISOString(), trafficError: '' });
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
    Object.assign(stats, clones, { clonesFetchedAt: new Date().toISOString(), clonesError: '' });
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
    Object.assign(stats, referrers, { referrersFetchedAt: new Date().toISOString(), referrersError: '' });
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

  const startedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const recentRepositoryRefreshes = isManualRefreshSource(source)
    ? getRecentCompletedRepositoryRefreshes(await getRefreshCoordination())
    : {};
  const skippedRepositories = repositories.filter((repository) => {
    const normalizedRepository = normalizeRepositoryName(repository);
    return Boolean(normalizedRepository && recentRepositoryRefreshes[normalizedRepository] && latestStats[repository]);
  });
  const skippedRepositorySet = new Set(skippedRepositories);
  const repositoriesToRefresh = repositories.filter((repository) => !skippedRepositorySet.has(repository));
  const accountResult = repositoriesToRefresh.length > 0
    ? await refreshAccountStats(githubToken, previousAccountStats)
    : { accountStats: normalizeAccountStats(previousAccountStats), error: '' };
  let completed = skippedRepositories.length;
  const results = await mapWithConcurrency(repositoriesToRefresh, REPOSITORY_REQUEST_CONCURRENCY_LIMIT, async (repository) => {
    const previousStats = latestStats[repository] || { repository };
    const result = await refreshRepositoryStats(repository, githubToken, previousStats);

    completed += 1;
    notifyProgress(onProgress, {
      repository,
      completed,
      total: repositories.length,
      result,
      skipped: skippedRepositories.length,
    });

    return result;
  });

  const nextLatestStats = { ...latestStats };
  results.forEach(({ repository, stats }) => {
    nextLatestStats[repository] = stats;
  });

  const completedAt = new Date().toISOString();

  const pendingActivity = options.detectActivity
    ? await detectRefreshActivity(
      settings,
      latestStats,
      nextLatestStats,
      previousAccountStats,
      accountResult.accountStats,
      completedAt,
      repositoriesToRefresh,
      options,
    )
    : null;

  const savedLatestStats = await mergeLatestStats(Object.fromEntries(results.map(({ repository, stats }) => [repository, stats])), { configuredOnly: true });

  if (isManualRefreshSource(source)) {
    await syncNotificationBaselinesFromManualRefresh({
      results,
      accountStats: accountResult.accountStats,
      accountError: accountResult.error,
      fetchedAt: completedAt,
    });
  }

  return {
    startedAt,
    fetchedAt: completedAt,
    results,
    skippedRepositories,
    refreshedRepositoryCount: results.length,
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

  const startedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const previousStats = latestStats[repository] || { repository };
  const result = await refreshRepositoryStats(repository, githubToken, previousStats);
  const nextLatestStats = { ...latestStats, [repository]: result.stats };
  const completedAt = new Date().toISOString();
  const pendingActivity = options.detectActivity
    ? await detectRefreshActivity(
      settings,
      latestStats,
      nextLatestStats,
      undefined,
      undefined,
      completedAt,
      [repository],
      options,
    )
    : null;

  const savedLatestStats = await mergeLatestStats({ [repository]: result.stats }, { configuredOnly: true });

  return {
    startedAt,
    fetchedAt: completedAt,
    repository,
    result,
    latestStats: savedLatestStats,
    pendingActivity,
  };
}
