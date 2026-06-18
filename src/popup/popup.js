import { getLatestStats, getSettings } from '../shared/storage.js';

const repositoryCount = document.getElementById('repository-count');
const tokenStatus = document.getElementById('token-status');
const lastUpdated = document.getElementById('last-updated');
const totalStars = document.getElementById('total-stars');
const totalSubscribers = document.getElementById('total-subscribers');
const totalForks = document.getElementById('total-forks');

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function hasCachedMetadata(stats) {
  return Boolean(stats?.fetchedAt)
    && Number.isFinite(stats.stars)
    && Number.isFinite(stats.forks)
    && Number.isFinite(stats.subscribers);
}

function formatLastUpdated(latestStats, repositories) {
  const timestamps = repositories
    .map((repository) => (hasCachedMetadata(latestStats[repository]) ? latestStats[repository].fetchedAt : ''))
    .filter(Boolean)
    .sort();

  if (timestamps.length === 0) {
    return 'Last updated: Not refreshed yet';
  }

  return `Last updated: ${new Date(timestamps[timestamps.length - 1]).toLocaleString()}`;
}

async function renderSettingsSummary() {
  try {
    const [settings, latestStats] = await Promise.all([getSettings(), getLatestStats()]);
    const totals = settings.repositories.reduce((accumulator, repository) => {
      const stats = latestStats[repository];

      if (hasCachedMetadata(stats)) {
        accumulator.cachedCount += 1;
        accumulator.stars += stats.stars;
        accumulator.subscribers += stats.subscribers;
        accumulator.forks += stats.forks;
      }

      return accumulator;
    }, { cachedCount: 0, stars: 0, subscribers: 0, forks: 0 });
    const hasAnyCachedMetadata = totals.cachedCount > 0;

    repositoryCount.textContent = `Repositories configured: ${settings.repositories.length}`;
    tokenStatus.textContent = `Token saved: ${settings.githubToken ? 'Yes' : 'No'}`;
    lastUpdated.textContent = formatLastUpdated(latestStats, settings.repositories);
    totalStars.textContent = hasAnyCachedMetadata ? formatNumber(totals.stars) : '—';
    totalSubscribers.textContent = hasAnyCachedMetadata ? formatNumber(totals.subscribers) : '—';
    totalForks.textContent = hasAnyCachedMetadata ? formatNumber(totals.forks) : '—';
  } catch (error) {
    repositoryCount.textContent = 'Repositories configured: unavailable';
    tokenStatus.textContent = 'Token saved: unavailable';
    lastUpdated.textContent = 'Last updated: unavailable';
  }
}

renderSettingsSummary();
