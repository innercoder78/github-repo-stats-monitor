import { getLatestStats, getSettings } from '../shared/storage.js';
import { refreshStatsCache } from '../shared/refresh-stats.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';

const repositoryCount = document.getElementById('repository-count');
const tokenStatus = document.getElementById('token-status');
const lastUpdated = document.getElementById('last-updated');
const totalStars = document.getElementById('total-stars');
const totalForks = document.getElementById('total-forks');
const totalViews = document.getElementById('total-views');
const totalClones = document.getElementById('total-clones');
const popupStatus = document.getElementById('popup-status');
const refreshButton = document.getElementById('refresh-stats');

let currentSettings = { githubToken: '', repositories: [], appearance: 'light' };
let currentLatestStats = {};
let isRefreshing = false;

applySavedAppearance();

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

function hasCachedMetadata(stats) {
  return Boolean(stats?.fetchedAt)
    && Number.isFinite(stats.stars)
    && Number.isFinite(stats.forks);
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

function renderStatsSummary(settings, latestStats) {
  const totals = settings.repositories.reduce((accumulator, repository) => {
    const stats = latestStats[repository];

    if (hasCachedMetadata(stats)) {
      accumulator.cachedCount += 1;
      accumulator.stars += stats.stars;
      accumulator.forks += stats.forks;
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
  }, { cachedCount: 0, trafficCount: 0, clonesCount: 0, stars: 0, forks: 0, views: 0, clones: 0 });
  const hasAnyCachedMetadata = totals.cachedCount > 0;
  const hasAnyCachedTraffic = totals.trafficCount > 0;
  const hasAnyCachedClones = totals.clonesCount > 0;

  repositoryCount.textContent = `Repositories configured: ${settings.repositories.length}`;
  tokenStatus.textContent = settings.githubToken
    ? 'Token saved: Yes'
    : 'Token saved: No. Open Settings to add one.';
  lastUpdated.textContent = formatLastUpdated(latestStats, settings.repositories);
  totalStars.textContent = hasAnyCachedMetadata ? formatNumber(totals.stars) : '—';
  totalForks.textContent = hasAnyCachedMetadata ? formatNumber(totals.forks) : '—';
  totalViews.textContent = hasAnyCachedTraffic ? formatNumber(totals.views) : '—';
  totalClones.textContent = hasAnyCachedClones ? formatNumber(totals.clones) : '—';
}

async function renderSettingsSummary() {
  try {
    [currentSettings, currentLatestStats] = await Promise.all([getSettings(), getLatestStats()]);
    applyAppearance(currentSettings.appearance);
    renderStatsSummary(currentSettings, currentLatestStats);
    setGuidanceStatus(currentSettings);
    setRefreshButtonState();
  } catch (error) {
    repositoryCount.textContent = 'Repositories configured: unavailable';
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
  popupStatus.textContent = 'Refreshing…';

  try {
    const refreshResult = await refreshStatsCache(currentSettings, currentLatestStats);
    currentLatestStats = refreshResult.latestStats;
    renderStatsSummary(currentSettings, currentLatestStats);

    const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.clonesError || stats.referrersError).length;
    popupStatus.textContent = failureCount === 0
      ? 'Stats refreshed.'
      : 'Refresh finished with GitHub request errors. Showing saved values where available.';
  } catch (error) {
    popupStatus.textContent = error.message || 'Refresh failed. Showing saved values where available.';
  }

  isRefreshing = false;
  setRefreshButtonState();
}

renderSettingsSummary();
