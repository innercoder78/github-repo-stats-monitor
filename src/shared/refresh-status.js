function getRefreshedRepositoryCount(refreshResult) {
  return Number.isFinite(Number(refreshResult?.refreshedRepositoryCount))
    ? Number(refreshResult.refreshedRepositoryCount)
    : Array.isArray(refreshResult?.results) ? refreshResult.results.length : 0;
}

export function formatRepositoryRefreshSummary(refreshResult) {
  const skippedCount = Array.isArray(refreshResult?.skippedRepositories) ? refreshResult.skippedRepositories.length : 0;
  const refreshedCount = getRefreshedRepositoryCount(refreshResult);

  if (skippedCount === 0) {
    return '';
  }

  if (refreshedCount === 0) {
    return 'All repositories used recently refreshed data.';
  }

  return `Refreshed ${refreshedCount} ${refreshedCount === 1 ? 'repository' : 'repositories'}. ${skippedCount} skipped due to recent data found.`;
}

function hasRepositoryError(result) {
  const stats = result?.stats || {};
  return Boolean(stats.error || stats.trafficError || stats.clonesError || stats.referrersError);
}

export function getFullRefreshStatus(refreshResult, { formatTime = (value) => value } = {}) {
  const results = Array.isArray(refreshResult?.results) ? refreshResult.results : [];
  const failureCount = results.filter(hasRepositoryError).length;
  const successCount = results.length - failureCount;
  const accountAttempted = Boolean(refreshResult?.accountAttempted);
  const accountRefreshed = Boolean(refreshResult?.accountRefreshed);
  const accountFailed = Boolean(accountAttempted && !accountRefreshed);
  const repositorySummary = formatRepositoryRefreshSummary(refreshResult);
  const allRepositoriesReused = results.length === 0 && Array.isArray(refreshResult?.skippedRepositories) && refreshResult.skippedRepositories.length > 0;
  const prefix = repositorySummary ? `${repositorySummary} ` : '';

  if (accountRefreshed && failureCount === 0) {
    if (allRepositoriesReused) {
      return {
        status: 'success',
        message: 'Account followers refreshed. All repositories used recently refreshed data.',
      };
    }

    return {
      status: 'success',
      message: repositorySummary || `Last successful refresh: ${formatTime(refreshResult?.accountFetchedAt || refreshResult?.fetchedAt)}`,
    };
  }

  if (accountFailed && successCount > 0) {
    return {
      status: 'warning',
      message: `${prefix}Refresh finished with partial errors. Account refresh failed; last saved account values are shown where available.`,
    };
  }

  if (accountRefreshed && failureCount > 0) {
    return {
      status: 'warning',
      message: `${prefix}Refresh finished with partial errors. Last saved values are shown where available.`,
    };
  }

  if (accountFailed && allRepositoriesReused) {
    return {
      status: 'warning',
      message: 'Account refresh failed; last saved account values are shown where available. All repositories used recently refreshed data.',
    };
  }

  if (accountFailed) {
    return {
      status: 'error',
      message: `${prefix}Refresh finished with errors. Last saved values are shown where available.`,
    };
  }

  if (failureCount > 0 && successCount > 0) {
    return {
      status: 'warning',
      message: `${prefix}Refresh finished with partial errors. Last saved values are shown where available.`,
    };
  }

  if (failureCount > 0) {
    return {
      status: 'error',
      message: `${prefix}Refresh finished with errors. Last saved values are shown where available.`,
    };
  }

  return {
    status: 'success',
    message: repositorySummary || `Last successful refresh: ${formatTime(refreshResult?.fetchedAt)}`,
  };
}
