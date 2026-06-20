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

export async function refreshStatsCache(settings, currentLatestStats) {
  const githubToken = typeof settings?.githubToken === 'string' ? settings.githubToken : '';
  const repositories = Array.isArray(settings?.repositories) ? settings.repositories : [];

  if (!githubToken) {
    throw new Error('No token saved. Open Settings and add a GitHub token to refresh stats.');
  }

  if (repositories.length === 0) {
    throw new Error('No repositories configured. Open Settings and add at least one repository.');
  }

  const fetchedAt = new Date().toISOString();
  const latestStats = currentLatestStats && typeof currentLatestStats === 'object' ? currentLatestStats : {};
  const results = await Promise.all(repositories.map(async (repository) => {
    const previousStats = latestStats[repository] || { repository };
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
  }));

  const nextLatestStats = { ...latestStats };
  results.forEach(({ repository, stats }) => {
    nextLatestStats[repository] = stats;
  });

  const savedLatestStats = await saveLatestStats(nextLatestStats);

  return { fetchedAt, results, latestStats: savedLatestStats };
}
