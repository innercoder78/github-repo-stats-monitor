import { extendGitHubQuietWindowUntil } from './github-activity.js';
const GITHUB_API_VERSION = '2022-11-28';

export const GITHUB_REQUEST_CONCURRENCY_LIMIT = 4;
export const GITHUB_REQUEST_MAX_ATTEMPTS = 3;
const GITHUB_RETRYABLE_STATUSES = new Set([408, 500, 502, 503, 504]);
const GITHUB_NON_RETRYABLE_STATUSES = new Set([401, 403, 404, 429]);
let retryDelay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let activeGitHubRequestCount = 0;
const githubRequestQueue = [];

function isGitHubApiUrl(url) {
  try {
    return new URL(String(url)).hostname === 'api.github.com';
  } catch (error) {
    return false;
  }
}

function drainGitHubRequestQueue() {
  while (activeGitHubRequestCount < GITHUB_REQUEST_CONCURRENCY_LIMIT && githubRequestQueue.length > 0) {
    const task = githubRequestQueue.shift();
    task();
  }
}

export function getGitHubRequestLimiterState() {
  return { active: activeGitHubRequestCount, queued: githubRequestQueue.length };
}

function isSafeGetRequest(options = {}) {
  return String(options?.method || 'GET').toUpperCase() === 'GET';
}

function isAbortError(error) {
  return error?.name === 'AbortError';
}

function isRetryableResponse(response) {
  if (GITHUB_NON_RETRYABLE_STATUSES.has(response?.status)) return false;
  return GITHUB_RETRYABLE_STATUSES.has(response?.status);
}

function getRetryDelayMs(attempt) {
  return Math.min(1000, 100 * (2 ** Math.max(0, attempt - 1)));
}

async function runLimitedGitHubFetch(url, options) {
  return new Promise((resolve, reject) => {
    const run = () => {
      activeGitHubRequestCount += 1;
      Promise.resolve()
        .then(() => fetch(url, options))
        .then(resolve, reject)
        .finally(() => {
          activeGitHubRequestCount = Math.max(0, activeGitHubRequestCount - 1);
          drainGitHubRequestQueue();
        });
    };

    githubRequestQueue.push(run);
    drainGitHubRequestQueue();
  });
}

export async function fetchGitHub(url, options = {}) {
  if (!isGitHubApiUrl(url)) {
    return fetch(url, options);
  }

  const retryable = isSafeGetRequest(options);
  for (let attempt = 1; attempt <= GITHUB_REQUEST_MAX_ATTEMPTS; attempt += 1) {
    try {
      const response = await runLimitedGitHubFetch(url, options);
      if (!retryable || attempt >= GITHUB_REQUEST_MAX_ATTEMPTS || !isRetryableResponse(response)) {
        return response;
      }
      await retryDelay(getRetryDelayMs(attempt));
    } catch (error) {
      if (!retryable || isAbortError(error) || attempt >= GITHUB_REQUEST_MAX_ATTEMPTS) {
        throw error;
      }
      await retryDelay(getRetryDelayMs(attempt));
    }
  }
}

export function __setGitHubRetryDelayForTest(delayFunction) {
  retryDelay = typeof delayFunction === 'function' ? delayFunction : retryDelay;
}

export function __resetGitHubRequestLimiterForTest() {
  activeGitHubRequestCount = 0;
  githubRequestQueue.length = 0;
}

function sanitizeRepository(repository) {
  return String(repository || '').trim().toLowerCase();
}

function getHeaderValue(headers, name) {
  if (!headers || typeof headers.get !== 'function') {
    return '';
  }

  return String(headers.get(name) || '').trim();
}

function getGitHubRateLimitHeaders(headers) {
  return {
    limit: getHeaderValue(headers, 'x-ratelimit-limit'),
    remaining: getHeaderValue(headers, 'x-ratelimit-remaining'),
    used: getHeaderValue(headers, 'x-ratelimit-used'),
    reset: getHeaderValue(headers, 'x-ratelimit-reset'),
    resource: getHeaderValue(headers, 'x-ratelimit-resource'),
    retryAfter: getHeaderValue(headers, 'retry-after'),
  };
}

async function readGitHubErrorBody(response) {
  if (!response) {
    return { message: '' };
  }

  try {
    const data = await response.json();
    return { message: String(data?.message || '') };
  } catch (error) {
    try {
      if (typeof response.text === 'function') {
        return { message: String(await response.text() || '') };
      }
    } catch (textError) {
      return { message: '' };
    }
  }

  return { message: '' };
}

function getRateLimitQuietUntil(headers) {
  const rateLimit = getGitHubRateLimitHeaders(headers);
  const retryAfterSeconds = Number(rateLimit.retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    return new Date(Date.now() + retryAfterSeconds * 1000).toISOString();
  }
  const retryAfterDate = Date.parse(rateLimit.retryAfter || '');
  if (Number.isFinite(retryAfterDate) && retryAfterDate > Date.now()) {
    return new Date(retryAfterDate).toISOString();
  }
  const resetSeconds = Number(rateLimit.reset);
  if (Number.isFinite(resetSeconds) && resetSeconds > 0 && resetSeconds * 1000 > Date.now()) {
    return new Date(resetSeconds * 1000).toISOString();
  }
  return '';
}

async function recordRateLimitQuietWindow(response) {
  if (![403, 429].includes(Number(response?.status))) return;
  const quietUntil = getRateLimitQuietUntil(response?.headers);
  if (!quietUntil) return;
  try {
    await extendGitHubQuietWindowUntil(quietUntil, 'rate-limit');
  } catch (error) {
    console.warn('Unable to record GitHub rate-limit quiet window.', error);
  }
}

function formatRateLimitReset(reset) {
  const resetSeconds = Number(reset);
  if (!Number.isFinite(resetSeconds) || resetSeconds <= 0) {
    return '';
  }

  return new Date(resetSeconds * 1000).toLocaleString();
}

function formatRetryAfter(retryAfter) {
  const retryAfterSeconds = Number(retryAfter);
  if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
    const minutes = Math.floor(retryAfterSeconds / 60);
    const seconds = retryAfterSeconds % 60;

    if (minutes > 0 && seconds > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'} and ${seconds} second${seconds === 1 ? '' : 's'}`;
    }

    if (minutes > 0) {
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }

    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }

  const retryAfterDate = Date.parse(retryAfter || '');
  if (Number.isFinite(retryAfterDate)) {
    return `until ${new Date(retryAfterDate).toLocaleString()}`;
  }

  return '';
}

function isTrafficEndpointContext(context) {
  return ['traffic-views', 'traffic-clones', 'traffic-referrers'].includes(context);
}

function isRepositoryMetadataContext(context) {
  return context === 'repository-metadata';
}

function isSecondaryRateLimitMessage(message) {
  const normalizedMessage = String(message || '').toLowerCase();
  return normalizedMessage.includes('secondary rate limit')
    || normalizedMessage.includes('abuse detection')
    || normalizedMessage.includes('abuse rate limits')
    || normalizedMessage.includes('too many requests') && normalizedMessage.includes('retry');
}

function isPrimaryRateLimitMessage(message) {
  const normalizedMessage = String(message || '').toLowerCase();
  return normalizedMessage.includes('api rate limit exceeded')
    || normalizedMessage.includes('rate limit exceeded');
}

export function buildGitHubRequestErrorMessage({ status, context = 'general', headers = {}, bodyMessage = '' } = {}) {
  const rateLimit = getGitHubRateLimitHeaders(headers);
  const remaining = Number(rateLimit.remaining);
  const primaryRateLimitExhausted = (status === 403 || status === 429) && Number.isFinite(remaining) && remaining === 0;
  const hasRetryAfter = Boolean(rateLimit.retryAfter);

  if (status === 401) {
    return 'GitHub rejected the saved token. Check that the token is valid and still active.';
  }

  if (primaryRateLimitExhausted || ((status === 403 || status === 429) && isPrimaryRateLimitMessage(bodyMessage))) {
    const resetTime = formatRateLimitReset(rateLimit.reset);
    return resetTime
      ? `GitHub API rate limit reached. Last saved values are shown where available. Try again after ${resetTime}.`
      : 'GitHub API rate limit reached. Last saved values are shown where available. Try again later.';
  }

  if ((status === 403 || status === 429) && (isSecondaryRateLimitMessage(bodyMessage) || (hasRetryAfter && remaining !== 0))) {
    const waitTime = formatRetryAfter(rateLimit.retryAfter);
    return waitTime
      ? `GitHub’s secondary rate limit was triggered. Wait ${waitTime} before refreshing again. Last saved values are shown where available.`
      : 'GitHub’s secondary rate limit was triggered. Wait before refreshing again. Last saved values are shown where available.';
  }

  if (status === 429) {
    return 'GitHub is rate limiting requests. Try again later. Last saved values are shown where available.';
  }

  if (status === 403 && isTrafficEndpointContext(context)) {
    return 'Traffic data unavailable. Check that your token has Administration: Read-only permission for this repository.';
  }

  if (status === 404 && isRepositoryMetadataContext(context)) {
    return 'Repository data unavailable. The repository was not found, or the token does not have access to it.';
  }

  if (status === 404) {
    return 'Repository data unavailable. The repository was not found, or the token does not have access to it.';
  }

  if (status === 403) {
    return 'GitHub denied the request. Last saved values are shown where available.';
  }

  return `GitHub request failed with status ${status}.`;
}

async function getGitHubRequestErrorMessage(response, context) {
  const body = await readGitHubErrorBody(response);
  await recordRateLimitQuietWindow(response);
  return buildGitHubRequestErrorMessage({
    status: response?.status,
    context,
    headers: response?.headers,
    bodyMessage: body.message,
  });
}

const GITHUB_NETWORK_ERROR_MESSAGE = 'GitHub could not be reached. Check your connection and try again.';

function getGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}


function mapAuthenticatedRepository(repository) {
  return {
    fullName: String(repository?.full_name || '').trim(),
    visibility: String(repository?.visibility || '').trim(),
    private: Boolean(repository?.private),
    archived: Boolean(repository?.archived),
    fork: Boolean(repository?.fork),
    htmlUrl: String(repository?.html_url || '').trim(),
  };
}


export async function fetchAuthenticatedAccount(token) {
  const safeToken = typeof token === 'string' ? token.trim() : '';

  if (!safeToken) {
    throw new Error('A GitHub token is required before fetching account stats.');
  }

  let response;

  try {
    response = await fetchGitHub('https://api.github.com/user', {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getGitHubRequestErrorMessage(response, 'account'));
  }

  const data = await response.json();

  return {
    login: String(data?.login || ''),
    followers: Number(data?.followers) || 0,
  };
}

export async function fetchAuthenticatedRepositories(token) {
  const safeToken = typeof token === 'string' ? token.trim() : '';

  if (!safeToken) {
    throw new Error('A GitHub token is required before importing repositories.');
  }

  const repositories = [];
  let page = 1;
  let hasNextPage = true;

  while (hasNextPage) {
    let response;

    try {
      const url = new URL('https://api.github.com/user/repos');
      url.searchParams.set('visibility', 'all');
      url.searchParams.set('affiliation', 'owner,collaborator,organization_member');
      url.searchParams.set('sort', 'full_name');
      url.searchParams.set('direction', 'asc');
      url.searchParams.set('per_page', '100');
      url.searchParams.set('page', String(page));

      response = await fetchGitHub(url.toString(), {
        headers: getGitHubHeaders(safeToken),
      });
    } catch (error) {
      throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
    }

    if (!response.ok) {
      throw new Error(await getGitHubRequestErrorMessage(response, 'authenticated-repositories'));
    }

    const data = await response.json();
    const pageRepositories = Array.isArray(data) ? data.map(mapAuthenticatedRepository).filter((repository) => repository.fullName) : [];
    repositories.push(...pageRepositories);

    const linkHeader = response.headers.get('Link') || '';
    hasNextPage = /<[^>]+[?&]page=\d+[^>]*>;\s*rel="next"/.test(linkHeader) || (linkHeader.includes('rel="next"'));

    if (!hasNextPage && Array.isArray(data) && data.length === 100) {
      hasNextPage = true;
    }

    page += 1;
  }

  return repositories;
}


function assertRepositoryAndToken(repository, token, requestDescription) {
  const normalizedRepository = sanitizeRepository(repository);
  const safeToken = typeof token === 'string' ? token.trim() : '';

  if (!safeToken) {
    throw new Error(`A GitHub token is required before fetching repository ${requestDescription}.`);
  }

  if (!normalizedRepository.includes('/')) {
    throw new Error('Repository must use the owner/repo format.');
  }

  return { normalizedRepository, safeToken };
}

function getRepositoryApiPath(repository) {
  return encodeURIComponent(repository).replace('%2F', '/');
}

export async function fetchRepositoryMetadata(repository, token) {
  const { normalizedRepository, safeToken } = assertRepositoryAndToken(repository, token, 'metadata');

  let response;

  try {
    response = await fetchGitHub(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getGitHubRequestErrorMessage(response, 'repository-metadata'));
  }

  const data = await response.json();

  return {
    repository: normalizedRepository,
    stars: Number(data.stargazers_count) || 0,
    forks: Number(data.forks_count) || 0,
    subscribers: Number(data.subscribers_count) || 0,
  };
}


export async function fetchRepositoryTrafficViews(repository, token) {
  const { normalizedRepository, safeToken } = assertRepositoryAndToken(repository, token, 'traffic views');
  let response;

  try {
    response = await fetchGitHub(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/views?per=day`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getGitHubRequestErrorMessage(response, 'traffic-views'));
  }

  const data = await response.json();
  const dailyViews = Array.isArray(data.views)
    ? data.views.map((entry) => ({
      date: String(entry?.timestamp || '').slice(0, 10),
      views: Number(entry?.count) || 0,
      uniqueVisitors: Number(entry?.uniques) || 0,
    })).filter((entry) => entry.date)
    : [];

  return {
    repository: normalizedRepository,
    views: Number(data.count) || 0,
    uniqueVisitors: Number(data.uniques) || 0,
    dailyViews,
  };
}


export async function fetchRepositoryTrafficClones(repository, token) {
  const { normalizedRepository, safeToken } = assertRepositoryAndToken(repository, token, 'traffic clones');
  let response;

  try {
    response = await fetchGitHub(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/clones?per=day`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getGitHubRequestErrorMessage(response, 'traffic-clones'));
  }

  const data = await response.json();
  const dailyClones = Array.isArray(data.clones)
    ? data.clones.map((entry) => ({
      date: String(entry?.timestamp || '').slice(0, 10),
      clones: Number(entry?.count) || 0,
      uniqueCloners: Number(entry?.uniques) || 0,
    })).filter((entry) => entry.date)
    : [];

  return {
    repository: normalizedRepository,
    clones: Number(data.count) || 0,
    dailyClones,
  };
}


export async function fetchRepositoryTrafficReferrers(repository, token) {
  const { normalizedRepository, safeToken } = assertRepositoryAndToken(repository, token, 'traffic referrers');
  let response;

  try {
    response = await fetchGitHub(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/popular/referrers`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error(GITHUB_NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    throw new Error(await getGitHubRequestErrorMessage(response, 'traffic-referrers'));
  }

  const data = await response.json();
  const referrers = Array.isArray(data)
    ? data.map((entry) => ({
      referrer: String(entry?.referrer || '').trim(),
      count: Number(entry?.count) || 0,
      uniques: Number(entry?.uniques) || 0,
    })).filter((entry) => entry.referrer)
    : [];

  return {
    repository: normalizedRepository,
    referrers,
  };
}
