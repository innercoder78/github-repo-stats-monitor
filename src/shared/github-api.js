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

export async function fetchRepositoryMetadata(repository, token) {
  const normalizedRepository = sanitizeRepository(repository);
  const safeToken = typeof token === 'string' ? token.trim() : '';

  if (!safeToken) {
    throw new Error('A GitHub token is required before fetching repository metadata.');
  }

  if (!normalizedRepository.includes('/')) {
    throw new Error('Repository must use the owner/repo format.');
  }

  let response;

  try {
    response = await fetch(`https://api.github.com/repos/${encodeURIComponent(normalizedRepository).replace('%2F', '/')}`, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${safeToken}`,
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
      },
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
