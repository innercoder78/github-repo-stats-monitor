const GITHUB_API_VERSION = '2022-11-28';

function sanitizeRepository(repository) {
  return String(repository || '').trim().toLowerCase();
}

function getErrorMessage(status) {
  if (status === 401) {
    return 'GitHub rejected the saved token. Check that the token is valid.';
  }

  if (status === 403) {
    return 'GitHub denied the request, or the API rate limit was reached.';
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


function getAuthenticatedRepositoriesErrorMessage(status) {
  if (status === 401) {
    return 'GitHub rejected the token. Check that the token is valid before importing repositories.';
  }

  if (status === 403) {
    return 'GitHub denied the repository import request. The token may not have access to list repositories, or the API rate limit may have been reached.';
  }

  return getErrorMessage(status);
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
    response = await fetch('https://api.github.com/user', {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error('Network failure while contacting GitHub account API. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(getErrorMessage(response.status));
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

      response = await fetch(url.toString(), {
        headers: getGitHubHeaders(safeToken),
      });
    } catch (error) {
      throw new Error('Network failure while contacting GitHub repositories API. Check your connection and try again.');
    }

    if (!response.ok) {
      throw new Error(getAuthenticatedRepositoriesErrorMessage(response.status));
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

function getTrafficErrorMessage(status) {
  if (status === 403) {
    return 'GitHub denied traffic access. Traffic, clones, and referrers require repository access and Administration: Read-only permission for fine-grained tokens, or the API rate limit may have been reached.';
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


export async function fetchRepositoryTrafficClones(repository, token) {
  const { normalizedRepository, safeToken } = assertRepositoryAndToken(repository, token, 'traffic clones');
  let response;

  try {
    response = await fetch(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/clones?per=day`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error('Network failure while contacting GitHub traffic clones API. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(getTrafficErrorMessage(response.status));
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
    response = await fetch(`https://api.github.com/repos/${getRepositoryApiPath(normalizedRepository)}/traffic/popular/referrers`, {
      headers: getGitHubHeaders(safeToken),
    });
  } catch (error) {
    throw new Error('Network failure while contacting GitHub traffic referrers API. Check your connection and try again.');
  }

  if (!response.ok) {
    throw new Error(getTrafficErrorMessage(response.status));
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
