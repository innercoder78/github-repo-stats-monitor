import { normalizeDisplayPreferences } from './display-format.js';

const count = (value) => Number.isSafeInteger(value) && value >= 0;
const timestamp = (value) => typeof value === 'string' && value.length > 0 && Number.isFinite(Date.parse(value));

function object(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(`${name} must be an object`);
}

// Explicit input only: never reads storage, credentials, refresh state, or the network.
export function validateSummaryImageData(data) {
  object(data, 'Summary image data');
  if (typeof data.username !== 'string' || data.username.length > 256 || /[\u0000-\u001f\u007f]/u.test(data.username)) {
    throw new TypeError('username must be a printable string of at most 256 characters');
  }
  for (const key of ['followers', 'stars', 'forks', 'watchers']) {
    if (data[key] !== null && !count(data[key])) throw new TypeError(`${key} must be null or a nonnegative safe integer`);
  }
  if (!count(data.configuredRepositories) || !count(data.validRepositories)
      || data.validRepositories > data.configuredRepositories) throw new TypeError('Invalid repository coverage');
  const repositoryValues = [data.stars, data.forks, data.watchers];
  if (data.validRepositories === 0 ? repositoryValues.some((value) => value !== null) : repositoryValues.some((value) => value === null)) {
    throw new TypeError('Repository statistics must match coverage');
  }
  const hasValues = data.followers !== null || data.validRepositories > 0;
  if (hasValues ? !timestamp(data.dataAsOf) : data.dataAsOf !== null) throw new TypeError('Freshness must describe available data');
  return {
    username: data.username.trim(), followers: data.followers, stars: data.stars, forks: data.forks, watchers: data.watchers,
    configuredRepositories: data.configuredRepositories, validRepositories: data.validRepositories,
    dataAsOf: data.dataAsOf, displayPreferences: normalizeDisplayPreferences(data.displayPreferences),
  };
}

// Mirrors the saved metadata fields, without normalizers that turn missing values into zero.
export function prepareSummaryImageData({ repositories, latestStats = {}, accountStats = null, displayPreferences } = {}) {
  if (!Array.isArray(repositories) || repositories.some((name) => typeof name !== 'string' || !name.trim())
      || new Set(repositories).size !== repositories.length) throw new TypeError('repositories must contain unique nonempty names');
  object(latestStats, 'latestStats');
  if (accountStats !== null) object(accountStats, 'accountStats');
  const valid = repositories.map((name) => Object.hasOwn(latestStats, name) ? latestStats[name] : null)
    .filter((stats) => timestamp(stats?.fetchedAt) && ['stars', 'forks', 'subscribers'].every((key) => count(stats[key])));
  const accountValid = typeof accountStats?.login === 'string' && Boolean(accountStats.login.trim())
    && count(accountStats.followers) && timestamp(accountStats.fetchedAt);
  const times = valid.map((stats) => stats.fetchedAt);
  if (accountValid) times.push(accountStats.fetchedAt);
  const sum = (key) => valid.length ? valid.reduce((total, stats) => total + stats[key], 0) : null;
  return validateSummaryImageData({
    username: typeof accountStats?.login === 'string' ? accountStats.login : '',
    followers: accountValid ? accountStats.followers : null,
    stars: sum('stars'), forks: sum('forks'), watchers: sum('subscribers'),
    configuredRepositories: repositories.length, validRepositories: valid.length,
    dataAsOf: times.length ? times.reduce((oldest, value) => Date.parse(value) < Date.parse(oldest) ? value : oldest) : null,
    displayPreferences,
  });
}
