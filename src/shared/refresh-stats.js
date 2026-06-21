import { fetchRepositoryMetadata, fetchRepositoryTrafficClones, fetchRepositoryTrafficReferrers, fetchRepositoryTrafficViews } from './github-api.js';
import { saveLatestStats } from './storage.js';

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
  const { githubToken, repositories } = getRefreshInputs(settings);
  const onProgress = options && typeof options === 'object' ? options.onProgress : undefined;

  const fetchedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
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

  const savedLatestStats = await saveLatestStats(nextLatestStats);

  return { fetchedAt, results, latestStats: savedLatestStats };
}

export async function refreshRepositoryStatsCache(settings, currentLatestStats, repository) {
  const { githubToken, repositories } = getRefreshInputs(settings);

  if (!repositories.includes(repository)) {
    throw new Error('Repository is not configured. Open Settings and add it before refreshing.');
  }

  const fetchedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const previousStats = latestStats[repository] || { repository };
  const result = await refreshRepositoryStats(repository, githubToken, previousStats, fetchedAt);
  const nextLatestStats = { ...latestStats, [repository]: result.stats };
  const savedLatestStats = await saveLatestStats(nextLatestStats);

  return {
    fetchedAt,
    repository,
    result,
    latestStats: savedLatestStats,
  };
}
