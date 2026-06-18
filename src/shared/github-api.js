const GITHUB_API_VERSION = '2022-11-28';

function sanitizeRepository(repository) {
  return String(repository || '').trim().toLowerCase();
}

function getErrorMessage(status) {
  if (status === 401) {
    return 'GitHub rejected the saved token. Check that the token is valid.';
  }

  if (status === 403) {
    return 'GitHub denied the request or the API rate limit was reached.';
  }

  if (status === 404) {
    return 'Repository was not found, or the token does not have access.';
  }

  return `GitHub request failed with status ${status}.`;
}

function getGitHubHeaders(token) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
    'X-GitHub-Api-Version': GITHUB_API_VERSION,
  };
}

function getTrafficErrorMessage(status) {
  if (status === 403) {
    return 'GitHub denied traffic access. Repository traffic requires access to the repository and proper token permissions, including Administration read permission for fine-grained tokens, or the API rate limit may have been reached.';
  }

  return getErrorMessage(status);
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
    response = await fetch(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error('Network failure while contacting GitHub. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status));
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
    response = await fetch(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/views?per=day`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error('Network failure while contacting GitHub traffic API. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(getTrafficErrorMessage(response.status));
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
