import { getAccountStats, getLatestStats, getPendingActivity, getSettings, savePendingActivity } from '../shared/storage.js';
import { createDeltaElement, cleanupShownPendingActivity } from '../shared/activity.js';
import { refreshStatsCache } from '../shared/refresh-stats.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';

const repositoryCount = document.getElementById('repository-count');
const tokenStatus = document.getElementById('token-status');
const lastUpdated = document.getElementById('last-updated');
const totalStars = document.getElementById('total-stars');
const totalForks = document.getElementById('total-forks');
const totalViews = document.getElementById('total-views');
const totalClones = document.getElementById('total-clones');
const accountFollowers = document.getElementById('account-followers');
const totalWatchers = document.getElementById('total-watchers');
const popupStatus = document.getElementById('popup-status');
const refreshButton = document.getElementById('refresh-stats');

let currentSettings = { githubToken: '', repositories: [], appearance: 'light' };
let currentLatestStats = {};
let currentAccountStats = { login: '', followers: 0, fetchedAt: '' };
let isRefreshing = false;
let currentPendingActivity = { account: {}, repositories: {}, updatedAt: '' };

applySavedAppearance();

async function clearBadgeText() {
  if (!globalThis.chrome?.action?.setBadgeText) {
    return;
  }

  try {
    await globalThis.chrome.action.setBadgeText({ text: '' });
  } catch (error) {
    console.warn('Unable to clear the extension badge.', error);
  }
}

clearBadgeText();

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('close-popup').addEventListener('click', () => {
  window.close();
});

refreshButton.addEventListener('click', refreshStats);

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatRefreshProgressMessage(progress) {
  const completed = Number.isFinite(progress?.completed) ? progress.completed : 0;
  const total = Number.isFinite(progress?.total) ? progress.total : currentSettings.repositories.length;
  const repository = typeof progress?.repository === 'string' ? progress.repository : '';
  const baseMessage = `Refreshing repositories… ${completed} of ${total} complete.`;

  return repository ? `${baseMessage} Last updated: ${repository}.` : baseMessage;
}

function hasCachedMetadata(stats) {
  return Boolean(stats?.fetchedAt)
    && Number.isFinite(stats.stars)
    && Number.isFinite(stats.forks)
    && Number.isFinite(stats.subscribers);
}

function hasCachedTraffic(stats) {
  return Boolean(stats?.trafficFetchedAt)
    && Number.isFinite(stats.views)
    && Number.isFinite(stats.uniqueVisitors);
}

function hasCachedClones(stats) {
  return Boolean(stats?.clonesFetchedAt) && Number.isFinite(stats.clones);
}

function formatLastUpdated(latestStats, repositories) {
  const timestamps = repositories
    .flatMap((repository) => {
      const stats = latestStats[repository];
      return [
        hasCachedMetadata(stats) ? stats.fetchedAt : '',
        hasCachedTraffic(stats) ? stats.trafficFetchedAt : '',
        hasCachedClones(stats) ? stats.clonesFetchedAt : '',
      ];
    })
    .filter(Boolean)
    .sort();

  if (timestamps.length === 0) {
    return 'Last updated: Not refreshed yet';
  }

  return `Last updated: ${new Date(timestamps[timestamps.length - 1]).toLocaleString()}`;
}

function setRefreshButtonState() {
  refreshButton.disabled = isRefreshing;
  refreshButton.textContent = isRefreshing ? 'Refreshing…' : 'Refresh';
  refreshButton.setAttribute('aria-busy', String(isRefreshing));
}

function setGuidanceStatus(settings) {
  if (settings.repositories.length === 0) {
    popupStatus.textContent = 'Add repositories in Settings before refreshing stats.';
    return;
  }

  if (!settings.githubToken) {
    popupStatus.textContent = 'Add a GitHub token in Settings before refreshing stats.';
    return;
  }

  popupStatus.textContent = 'Updates when you refresh.';
}


function clearActivityHighlights() {
  document.querySelectorAll('.activity-highlight').forEach((element) => {
    element.classList.remove('activity-highlight');
  });
  document.querySelectorAll('.activity-note, .activity-delta').forEach((element) => element.remove());
}

function addQuickSummaryActivity(valueElement, delta, label) {
  if (!valueElement || delta === 0) {
    return;
  }

  const metric = valueElement.closest('.metric');
  const metricBody = valueElement.closest('.metric-body');
  metric?.classList.add('activity-highlight');

  const note = document.createElement('span');
  note.className = 'activity-note';
  note.append(document.createTextNode('Activity changed: '), createDeltaElement(delta, label));
  metricBody?.append(note);
}

function getQuickSummaryRepositoryDeltas(pendingActivity) {
  return Object.values(pendingActivity?.repositories || {}).reduce((totals, activity) => {
    if (activity?.quickSummaryShown) {
      return totals;
    }

    totals.starsDelta += Number(activity?.starsDelta) || 0;
    totals.forksDelta += Number(activity?.forksDelta) || 0;
    totals.repoWatchersDelta += Number(activity?.repoWatchersDelta) || 0;
    return totals;
  }, { starsDelta: 0, forksDelta: 0, repoWatchersDelta: 0 });
}

async function markQuickSummaryActivityShown(consideredRepositories, displayedAccountActivity) {
  const nextPendingActivity = {
    ...currentPendingActivity,
    account: { ...currentPendingActivity.account },
    repositories: { ...currentPendingActivity.repositories },
  };
  let changed = false;

  if (displayedAccountActivity && Number(nextPendingActivity.account.followersDelta) !== 0 && !nextPendingActivity.account.quickSummaryShown) {
    nextPendingActivity.account.quickSummaryShown = true;
    changed = true;
  }

  Object.entries(nextPendingActivity.repositories).forEach(([repository, activity]) => {
    if (!activity.quickSummaryShown && consideredRepositories.has(repository)) {
      nextPendingActivity.repositories[repository] = { ...activity, quickSummaryShown: true };
      changed = true;
    }
  });

  if (!changed) {
    return;
  }

  try {
    currentPendingActivity = await savePendingActivity(cleanupShownPendingActivity(nextPendingActivity));
  } catch (error) {
    console.warn('Unable to mark Quick Summary activity as shown.', error);
  }
}

function renderQuickSummaryActivity() {
  clearActivityHighlights();

  const repositoryDeltas = getQuickSummaryRepositoryDeltas(currentPendingActivity);
  const consideredRepositories = new Set(Object.entries(currentPendingActivity.repositories || {})
    .filter(([, activity]) => !activity?.quickSummaryShown
      && (Number(activity?.starsDelta) !== 0
        || Number(activity?.forksDelta) !== 0
        || Number(activity?.repoWatchersDelta) !== 0))
    .map(([repository]) => repository));
  const pendingAccountDelta = Number(currentPendingActivity.account?.followersDelta) || 0;
  const displayedAccountActivity = !currentPendingActivity.account?.quickSummaryShown && pendingAccountDelta !== 0;

  if (repositoryDeltas.starsDelta !== 0) {
    addQuickSummaryActivity(totalStars, repositoryDeltas.starsDelta, 'Star');
  }

  if (repositoryDeltas.forksDelta !== 0) {
    addQuickSummaryActivity(totalForks, repositoryDeltas.forksDelta, 'Fork');
  }

  if (repositoryDeltas.repoWatchersDelta !== 0) {
    addQuickSummaryActivity(totalWatchers, repositoryDeltas.repoWatchersDelta, 'Repo Watcher');
  }

  if (displayedAccountActivity) {
    addQuickSummaryActivity(accountFollowers, pendingAccountDelta, 'Account Follower');
  }

  markQuickSummaryActivityShown(consideredRepositories, displayedAccountActivity);
}

function renderStatsSummary(settings, latestStats) {
  const totals = settings.repositories.reduce((accumulator, repository) => {
    const stats = latestStats[repository];

    if (hasCachedMetadata(stats)) {
      accumulator.cachedCount += 1;
      accumulator.stars += stats.stars;
      accumulator.forks += stats.forks;
      accumulator.watchers += stats.subscribers;
    }

    if (hasCachedTraffic(stats)) {
      accumulator.trafficCount += 1;
      accumulator.views += stats.views;
    }

    if (hasCachedClones(stats)) {
      accumulator.clonesCount += 1;
      accumulator.clones += stats.clones;
    }

    return accumulator;
  }, { cachedCount: 0, trafficCount: 0, clonesCount: 0, stars: 0, forks: 0, watchers: 0, views: 0, clones: 0 });
  const hasAnyCachedMetadata = totals.cachedCount > 0;
  const hasAnyCachedTraffic = totals.trafficCount > 0;
  const hasAnyCachedClones = totals.clonesCount > 0;

  repositoryCount.textContent = `Repositories monitored: ${settings.repositories.length}`;
  tokenStatus.textContent = settings.githubToken
    ? 'Token saved: Yes'
    : 'Token saved: No. Open Settings to add one.';
  lastUpdated.textContent = formatLastUpdated(latestStats, settings.repositories);
  totalStars.textContent = hasAnyCachedMetadata ? formatNumber(totals.stars) : '—';
  totalForks.textContent = hasAnyCachedMetadata ? formatNumber(totals.forks) : '—';
  accountFollowers.textContent = formatNumber(currentAccountStats.followers);
  totalWatchers.textContent = hasAnyCachedMetadata ? formatNumber(totals.watchers) : '—';
  totalViews.textContent = hasAnyCachedTraffic ? formatNumber(totals.views) : '—';
  totalClones.textContent = hasAnyCachedClones ? formatNumber(totals.clones) : '—';
  renderQuickSummaryActivity();
}

async function renderSettingsSummary() {
  try {
    [currentSettings, currentLatestStats, currentAccountStats, currentPendingActivity] = await Promise.all([getSettings(), getLatestStats(), getAccountStats(), getPendingActivity()]);
    applyAppearance(currentSettings.appearance);
    renderStatsSummary(currentSettings, currentLatestStats);
    setGuidanceStatus(currentSettings);
    setRefreshButtonState();
  } catch (error) {
    repositoryCount.textContent = 'Repositories monitored: unavailable';
    tokenStatus.textContent = 'Token saved: unavailable';
    lastUpdated.textContent = 'Last updated: unavailable';
    popupStatus.textContent = 'Unable to read cached data.';
    setRefreshButtonState();
  }
}

async function refreshStats() {
  if (isRefreshing) return;

  if (!currentSettings.githubToken) {
    popupStatus.textContent = 'No token saved. Open Settings and add a GitHub token.';
    return;
  }

  if (currentSettings.repositories.length === 0) {
    popupStatus.textContent = 'No repositories configured. Open Settings and add at least one repository.';
    return;
  }

  isRefreshing = true;
  setRefreshButtonState();
  popupStatus.textContent = formatRefreshProgressMessage({ completed: 0, total: currentSettings.repositories.length });

  try {
    const refreshResult = await refreshStatsCache(currentSettings, currentLatestStats, {
      accountStats: currentAccountStats,
      onProgress(progress) {
        popupStatus.textContent = formatRefreshProgressMessage(progress);
      },
    });
    currentLatestStats = refreshResult.latestStats;
    currentAccountStats = refreshResult.accountStats;
    renderStatsSummary(currentSettings, currentLatestStats);

    const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.clonesError || stats.referrersError).length;
    popupStatus.textContent = failureCount === 0
      ? 'Stats refreshed.'
      : 'Refresh finished with GitHub request errors. Last saved values are shown where available.';
  } catch (error) {
    popupStatus.textContent = error.message || 'Refresh failed. Last saved values are shown where available.';
  }

  isRefreshing = false;
  setRefreshButtonState();
}

renderSettingsSummary();
