function hasTimestamp(value) {
  return typeof value === 'string' && value.length > 0 && !Number.isNaN(Date.parse(value));
}

export function hasFreshnessCategoryData(stats, category) {
  if (category === 'metadata') {
    return hasTimestamp(stats?.fetchedAt)
      && Number.isFinite(stats?.stars)
      && Number.isFinite(stats?.forks)
      && Number.isFinite(stats?.subscribers);
  }
  if (category === 'views') {
    return hasTimestamp(stats?.trafficFetchedAt)
      && Number.isFinite(stats?.views)
      && Number.isFinite(stats?.uniqueVisitors);
  }
  if (category === 'clones') {
    return hasTimestamp(stats?.clonesFetchedAt) && Number.isFinite(stats?.clones);
  }
  if (category === 'referrers') {
    return hasTimestamp(stats?.referrersFetchedAt) && Array.isArray(stats?.referrers);
  }
  return false;
}

const timestampFields = {
  metadata: 'fetchedAt',
  views: 'trafficFetchedAt',
  clones: 'clonesFetchedAt',
  referrers: 'referrersFetchedAt',
};

export function getAggregateFreshness(repositories, latestStats, category) {
  const timestampField = timestampFields[category];
  const timestamps = repositories
    .map((repository) => latestStats?.[repository])
    .filter((stats) => hasFreshnessCategoryData(stats, category))
    .map((stats) => stats[timestampField]);

  return {
    timestamp: timestamps.length > 0
      ? timestamps.reduce((oldest, timestamp) => (Date.parse(timestamp) < Date.parse(oldest) ? timestamp : oldest))
      : '',
    contributing: timestamps.length,
    total: repositories.length,
  };
}
