import {
  getAccountStats,
  getLatestStats,
  getNotificationBaselines,
  getPendingActivity,
  getQuickSummaryStatus,
  getVersionCheckStatus,
  getSettings,
  savePendingActivity,
  getViewedBaselines,
  saveViewedBaselines,
} from '../shared/storage.js';
import { createDeltaElement, cleanupShownPendingActivity } from '../shared/activity.js';
import { closeExtensionPage } from '../shared/close-page.js';
import { refreshStatsCache } from '../shared/refresh-stats.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';
import { formatDisplayTimestamp, getDefaultDisplayPreferences } from '../shared/display-format.js';
import { openLatestReleasePage, shouldShowUpdateAvailable } from '../shared/version-check.js';

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
const updateCard = document.getElementById('update-card');
const updateBody = document.getElementById('update-body');
const viewLatestVersionButton = document.getElementById('view-latest-version');

let currentSettings = { githubToken: '', repositories: [], appearance: 'light', notifications: { backgroundChecksEnabled: false }, displayPreferences: getDefaultDisplayPreferences() };
let currentLatestStats = {};
let currentAccountStats = { login: '', followers: 0, fetchedAt: '' };
let isRefreshing = false;
let currentPendingActivity = {
  account: {},
  repositories: {},
  badgeActivity: { account: false, repositories: {}, updatedAt: '' },
  updatedAt: '',
};
let currentNotificationBaselines = { account: {}, repositories: {}, initialized: false, updatedAt: '' };
let currentQuickSummaryStatus = { manualRefreshAt: '' };
let currentViewedBaselines = { account: {}, repositories: {}, updatedAt: '' };
let currentVersionCheckStatus = null;

applySavedAppearance();

async function acknowledgeBadgeActivity() {
  try {
    const pendingActivity = await getPendingActivity();

    if (pendingActivity.badgeActivity?.account || Object.values(pendingActivity.badgeActivity?.repositories || {}).some(Boolean)) {
      await savePendingActivity({
        ...pendingActivity,
        badgeActivity: { account: false, repositories: {}, updatedAt: '' },
      });
    }
  } catch (error) {
    console.warn('Unable to acknowledge badge activity.', error);
  }
}

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

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

document.getElementById('close-popup').addEventListener('click', closeExtensionPage);

refreshButton.addEventListener('click', refreshStats);
viewLatestVersionButton.addEventListener('click', () => openLatestReleasePage(currentVersionCheckStatus || {}));

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

function formatCheckedAt(timestamp) {
  return formatDisplayTimestamp(timestamp, currentSettings.displayPreferences, 'compact') || 'Not yet';
}

function formatBackgroundCheckStatus(settings, baselines) {
  if (!settings.notifications?.backgroundChecksEnabled) {
    return 'Off';
  }

  return formatCheckedAt(baselines.updatedAt);
}

function renderPopupStatusLines(lines) {
  popupStatus.replaceChildren(...lines.map((line) => {
    const lineElement = document.createElement('span');
    lineElement.className = 'popup-status-line';
    lineElement.textContent = line;
    return lineElement;
  }));
}

function renderUpdateCard() {
  const status = currentVersionCheckStatus || {};
  const showUpdateCard = shouldShowUpdateAvailable(status);
  updateCard.hidden = !showUpdateCard;
  if (!showUpdateCard) return;
  updateBody.replaceChildren(
    `You are using version ${status.localVersion.trim()}.`,
    document.createElement('br'),
    `Version ${status.latestVersion.trim()} is available.`,
  );
}

function renderLastCheckedStatus() {
  renderPopupStatusLines([
    `Manual refresh: ${formatCheckedAt(currentQuickSummaryStatus.manualRefreshAt)}`,
    `Background check: ${formatBackgroundCheckStatus(currentSettings, currentNotificationBaselines)}`,
  ]);
}

function renderSetupGuidanceStatus(settings) {
  if (settings.repositories.length === 0) {
    renderPopupStatusLines(['Add repositories in Settings before refreshing stats.']);
    return true;
  }

  if (!settings.githubToken) {
    renderPopupStatusLines(['Add a GitHub token in Settings before refreshing stats.']);
    return true;
  }

  return false;
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

  return `Last updated: ${formatDisplayTimestamp(timestamps[timestamps.length - 1], currentSettings.displayPreferences, 'full')}`;
}

function setRefreshButtonState() {
  refreshButton.disabled = isRefreshing;
  refreshButton.textContent = isRefreshing ? 'Refreshing…' : 'Refresh';
  refreshButton.setAttribute('aria-busy', String(isRefreshing));
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
  note.append(createDeltaElement(delta, label));
  metricBody?.append(note);
}

function hasFetchedAccountStats(accountStats) {
  return Boolean(accountStats?.login)
    && Boolean(accountStats?.fetchedAt)
    && Number.isFinite(accountStats.followers);
}

function hasCurrentAccountViewedBaseline() {
  return hasFetchedAccountStats(currentAccountStats)
    && currentViewedBaselines.account?.login === currentAccountStats.login
    && Number.isFinite(Number(currentViewedBaselines.account?.followers));
}

function getBaselineDelta(baseline, key, currentValue) {
  if (!Number.isFinite(currentValue)) {
    return 0;
  }

  const baselineValue = Number(baseline?.[key]);
  return Number.isFinite(baselineValue) ? currentValue - baselineValue : 0;
}

function getQuickSummaryPendingDeltas() {
  return currentSettings.repositories.reduce((totals, repository) => {
    const activity = currentPendingActivity.repositories?.[repository];
    totals.starsDelta += Number(activity?.starsDelta) || 0;
    totals.forksDelta += Number(activity?.forksDelta) || 0;
    totals.repoWatchersDelta += Number(activity?.repoWatchersDelta) || 0;
    return totals;
  }, { starsDelta: 0, forksDelta: 0, repoWatchersDelta: 0 });
}

function getQuickSummaryViewedDeltas() {
  return currentSettings.repositories.reduce((totals, repository) => {
    const stats = currentLatestStats[repository];

    if (!hasCachedMetadata(stats)) {
      return totals;
    }

    const baseline = currentViewedBaselines.repositories?.[repository];
    totals.starsDelta += getBaselineDelta(baseline, 'stars', stats.stars);
    totals.forksDelta += getBaselineDelta(baseline, 'forks', stats.forks);
    totals.repoWatchersDelta += getBaselineDelta(baseline, 'repoWatchers', stats.subscribers);
    return totals;
  }, { starsDelta: 0, forksDelta: 0, repoWatchersDelta: 0 });
}

function getQuickSummaryPendingAccountDelta() {
  return Number(currentPendingActivity.account?.followersDelta) || 0;
}

function getPreferredQuickSummaryDelta(pendingDelta, viewedDelta) {
  return pendingDelta !== 0 ? pendingDelta : viewedDelta;
}

function getQuickSummaryAccountDelta() {
  if (!hasCurrentAccountViewedBaseline()) {
    return 0;
  }

  return getBaselineDelta(currentViewedBaselines.account, 'followers', currentAccountStats.followers);
}

async function markQuickSummaryActivityShown(consideredRepositories, displayedAccountActivity) {
  const nextPendingActivity = {
    ...currentPendingActivity,
    account: { ...currentPendingActivity.account },
    repositories: { ...currentPendingActivity.repositories },
    badgeActivity: {
      ...(currentPendingActivity.badgeActivity || {}),
      repositories: { ...(currentPendingActivity.badgeActivity?.repositories || {}) },
    },
  };
  let changed = false;
  let badgeActivityCleared = false;

  if (displayedAccountActivity && Number(nextPendingActivity.account.followersDelta) !== 0 && !nextPendingActivity.account.quickSummaryShown) {
    nextPendingActivity.account.quickSummaryShown = true;
    changed = true;
  }

  if (displayedAccountActivity && nextPendingActivity.badgeActivity.account) {
    nextPendingActivity.badgeActivity.account = false;
    changed = true;
    badgeActivityCleared = true;
  }

  consideredRepositories.forEach((repository) => {
    const activity = nextPendingActivity.repositories[repository];

    if (activity && !activity.quickSummaryShown) {
      nextPendingActivity.repositories[repository] = { ...activity, quickSummaryShown: true };
      changed = true;
    }

    if (nextPendingActivity.badgeActivity.repositories[repository]) {
      delete nextPendingActivity.badgeActivity.repositories[repository];
      changed = true;
      badgeActivityCleared = true;
    }
  });

  if (!changed) {
    return;
  }

  try {
    currentPendingActivity = await savePendingActivity(cleanupShownPendingActivity(nextPendingActivity));
    if (badgeActivityCleared) {
      await clearBadgeText();
    }
  } catch (error) {
    console.warn('Unable to mark Quick Summary activity as shown.', error);
  }
}

async function saveQuickSummaryViewedBaselines(consideredRepositories, displayedAccount) {
  const viewedAt = new Date().toISOString();
  const nextViewedBaselines = {
    ...currentViewedBaselines,
    account: { ...currentViewedBaselines.account },
    repositories: { ...currentViewedBaselines.repositories },
    updatedAt: viewedAt,
  };

  consideredRepositories.forEach((repository) => {
    const stats = currentLatestStats[repository];

    if (hasCachedMetadata(stats)) {
      nextViewedBaselines.repositories[repository] = {
        ...(nextViewedBaselines.repositories[repository] || {}),
        repository,
        stars: stats.stars,
        forks: stats.forks,
        repoWatchers: stats.subscribers,
        updatedAt: viewedAt,
      };
    }
  });

  if (displayedAccount && hasFetchedAccountStats(currentAccountStats)) {
    nextViewedBaselines.account = {
      login: currentAccountStats.login,
      followers: currentAccountStats.followers,
      updatedAt: viewedAt,
    };
  }

  try {
    currentViewedBaselines = await saveViewedBaselines(nextViewedBaselines);
  } catch (error) {
    console.warn('Unable to save Quick Summary viewed baselines.', error);
  }
}

function renderQuickSummaryActivity() {
  clearActivityHighlights();

  const pendingRepositoryDeltas = getQuickSummaryPendingDeltas();
  const viewedRepositoryDeltas = getQuickSummaryViewedDeltas();
  const repositoryDeltas = {
    starsDelta: getPreferredQuickSummaryDelta(pendingRepositoryDeltas.starsDelta, viewedRepositoryDeltas.starsDelta),
    forksDelta: getPreferredQuickSummaryDelta(pendingRepositoryDeltas.forksDelta, viewedRepositoryDeltas.forksDelta),
    repoWatchersDelta: getPreferredQuickSummaryDelta(pendingRepositoryDeltas.repoWatchersDelta, viewedRepositoryDeltas.repoWatchersDelta),
  };
  const consideredRepositories = new Set(currentSettings.repositories.filter((repository) => hasCachedMetadata(currentLatestStats[repository])));
  const pendingAccountDelta = getQuickSummaryPendingAccountDelta();
  const accountDelta = getPreferredQuickSummaryDelta(pendingAccountDelta, getQuickSummaryAccountDelta());
  const accountFollowersDisplayed = hasFetchedAccountStats(currentAccountStats);
  const showAccountFollowerPill = accountFollowersDisplayed && accountDelta !== 0;

  if (repositoryDeltas.starsDelta !== 0) {
    addQuickSummaryActivity(totalStars, repositoryDeltas.starsDelta, 'Star');
  }

  if (repositoryDeltas.forksDelta !== 0) {
    addQuickSummaryActivity(totalForks, repositoryDeltas.forksDelta, 'Fork');
  }

  if (repositoryDeltas.repoWatchersDelta !== 0) {
    addQuickSummaryActivity(totalWatchers, repositoryDeltas.repoWatchersDelta, 'Watcher');
  }

  if (showAccountFollowerPill) {
    addQuickSummaryActivity(accountFollowers, accountDelta, 'Account Follower');
  }

  markQuickSummaryActivityShown(consideredRepositories, accountFollowersDisplayed);
  saveQuickSummaryViewedBaselines(consideredRepositories, accountFollowersDisplayed);
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
  accountFollowers.textContent = hasFetchedAccountStats(currentAccountStats) ? formatNumber(currentAccountStats.followers) : '—';
  totalWatchers.textContent = hasAnyCachedMetadata ? formatNumber(totals.watchers) : '—';
  totalViews.textContent = hasAnyCachedTraffic ? formatNumber(totals.views) : '—';
  totalClones.textContent = hasAnyCachedClones ? formatNumber(totals.clones) : '—';
  renderQuickSummaryActivity();
}

async function renderSettingsSummary() {
  try {
    [
      currentSettings,
      currentLatestStats,
      currentAccountStats,
      currentPendingActivity,
      currentNotificationBaselines,
      currentQuickSummaryStatus,
      currentViewedBaselines,
      currentVersionCheckStatus,
    ] = await Promise.all([
      getSettings(),
      getLatestStats(),
      getAccountStats(),
      getPendingActivity(),
      getNotificationBaselines(),
      getQuickSummaryStatus(),
      getViewedBaselines(),
      getVersionCheckStatus(),
    ]);
    applyAppearance(currentSettings.appearance);
    renderStatsSummary(currentSettings, currentLatestStats);
    renderUpdateCard();
    if (!renderSetupGuidanceStatus(currentSettings)) {
      renderLastCheckedStatus();
    }
    setRefreshButtonState();
  } catch (error) {
    repositoryCount.textContent = 'Repositories monitored: unavailable';
    tokenStatus.textContent = 'Token saved: unavailable';
    lastUpdated.textContent = 'Last updated: unavailable';
    renderPopupStatusLines(['Unable to read cached data.']);
    setRefreshButtonState();
  }
}


async function reloadSavedRefreshData() {
  [currentLatestStats, currentAccountStats, currentPendingActivity, currentViewedBaselines] = await Promise.all([
    getLatestStats(),
    getAccountStats(),
    getPendingActivity(),
    getViewedBaselines(),
  ]);
  currentQuickSummaryStatus = await getQuickSummaryStatus();
  renderStatsSummary(currentSettings, currentLatestStats);
  if (!renderSetupGuidanceStatus(currentSettings)) {
    renderLastCheckedStatus();
  }
}

function formatRepositoryRefreshSummary(refreshResult) {
  const skippedCount = Array.isArray(refreshResult?.skippedRepositories) ? refreshResult.skippedRepositories.length : 0;
  const refreshedCount = Number.isFinite(Number(refreshResult?.refreshedRepositoryCount))
    ? Number(refreshResult.refreshedRepositoryCount)
    : Array.isArray(refreshResult?.results) ? refreshResult.results.length : 0;

  if (skippedCount === 0) {
    return '';
  }

  if (refreshedCount === 0) {
    return 'All repositories skipped due to recent data found.';
  }

  return `Refreshed ${refreshedCount} ${refreshedCount === 1 ? 'repository' : 'repositories'}. ${skippedCount} skipped due to recent data found.`;
}

async function refreshStats() {
  if (isRefreshing) return;

  if (currentSettings.repositories.length === 0) {
    renderPopupStatusLines(['Add repositories in Settings before refreshing stats.']);
    return;
  }

  if (!currentSettings.githubToken) {
    renderPopupStatusLines(['Add a GitHub token in Settings before refreshing stats.']);
    return;
  }

  isRefreshing = true;
  setRefreshButtonState();
  renderPopupStatusLines([formatRefreshProgressMessage({ completed: 0, total: currentSettings.repositories.length })]);

  try {
    const refreshResult = await refreshStatsCache(currentSettings, currentLatestStats, {
      source: 'quick-summary',
      accountStats: currentAccountStats,
      detectActivity: true,
      skipBadgeActivity: true,
      onProgress(progress) {
        renderPopupStatusLines([formatRefreshProgressMessage(progress)]);
      },
    });
    if (refreshResult.skipped) {
      await reloadSavedRefreshData();
    } else {
      currentLatestStats = refreshResult.latestStats;
      currentAccountStats = refreshResult.accountStats;
      currentQuickSummaryStatus = await getQuickSummaryStatus();
      if (refreshResult.pendingActivity) {
        currentPendingActivity = refreshResult.pendingActivity;
      }
      renderStatsSummary(currentSettings, currentLatestStats);
      renderUpdateCard();

      const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.clonesError || stats.referrersError).length;

      const refreshSummary = formatRepositoryRefreshSummary(refreshResult);
      if (failureCount === 0) {
        if (refreshSummary) {
          renderPopupStatusLines([refreshSummary]);
        } else {
          renderLastCheckedStatus();
        }
      } else {
        renderPopupStatusLines([`${refreshSummary ? `${refreshSummary} ` : ''}Refresh finished with GitHub request errors. Last saved values are shown where available.`]);
      }
    }
  } catch (error) {
    console.warn('Unable to refresh Quick Summary stats.', error);
    renderPopupStatusLines(['Refresh failed. Last saved values are shown where available.']);
  }

  isRefreshing = false;
  setRefreshButtonState();
}

async function initializePopup() {
  renderSettingsSummary();
}

initializePopup();
