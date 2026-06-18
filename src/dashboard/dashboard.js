import { fetchRepositoryMetadata } from '../shared/github-api.js';
import { getLatestStats, getSettings, saveLatestStats } from '../shared/storage.js';

const repoGrid = document.getElementById('repo-grid');
const emptyState = document.getElementById('empty-state');
const statusLine = document.getElementById('status-line');
const refreshButton = document.getElementById('refresh-now');
const summaryValues = {
  stars: document.getElementById('total-stars'),
  subscribers: document.getElementById('total-subscribers'),
  forks: document.getElementById('total-forks'),
};

let currentSettings = { githubToken: '', repositories: [] };
let currentLatestStats = {};
let isRefreshing = false;

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatRefreshTime(value) {
  if (!value) return 'Not refreshed yet';
  return new Date(value).toLocaleString();
}

function setStatus(message, type = '') {
  statusLine.textContent = message;
  statusLine.className = `muted status-line${type ? ` ${type}` : ''}`;
}

function hasCachedMetadata(stats) {
  return Boolean(stats?.fetchedAt)
    && Number.isFinite(stats.stars)
    && Number.isFinite(stats.forks)
    && Number.isFinite(stats.subscribers);
}

function createMetric(label, value = '—') {
  const metric = document.createElement('div');
  metric.className = 'metric';

  const metricLabel = document.createElement('span');
  metricLabel.textContent = label;

  const metricValue = document.createElement('strong');
  metricValue.textContent = value;

  metric.append(metricLabel, metricValue);
  return metric;
}

function createRepositoryCard(repository, stats) {
  const card = document.createElement('article');
  card.className = 'card repo-card';

  const title = document.createElement('h2');
  title.textContent = repository;

  const meta = document.createElement('p');
  meta.className = 'muted repo-meta';
  meta.textContent = stats?.fetchedAt ? `Last fetched: ${formatRefreshTime(stats.fetchedAt)}` : 'Last fetched: —';

  const cachedStats = hasCachedMetadata(stats) ? stats : null;
  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-grid';
  metricGrid.append(
    createMetric('Stars', cachedStats ? formatNumber(cachedStats.stars) : '—'),
    createMetric('Real watchers', cachedStats ? formatNumber(cachedStats.subscribers) : '—'),
    createMetric('Forks', cachedStats ? formatNumber(cachedStats.forks) : '—'),
    createMetric('Views, last 14 days'),
    createMetric('Unique visitors, last 14 days'),
  );

  const charts = document.createElement('div');
  charts.className = 'charts';
  ['Views, last 14 days', 'Unique visitors, last 14 days'].forEach((label) => {
    const placeholder = document.createElement('div');
    placeholder.className = 'chart-placeholder';
    placeholder.textContent = label;
    charts.append(placeholder);
  });

  card.append(title, meta, metricGrid);

  if (stats?.error) {
    const errorMessage = document.createElement('p');
    errorMessage.className = 'repo-error';
    errorMessage.textContent = stats.error;
    card.append(errorMessage);
  }

  card.append(charts);
  return card;
}

function renderSummary() {
  const totals = currentSettings.repositories.reduce((accumulator, repository) => {
    const stats = currentLatestStats[repository];

    if (hasCachedMetadata(stats)) {
      accumulator.cachedCount += 1;
      accumulator.stars += stats.stars;
      accumulator.subscribers += stats.subscribers;
      accumulator.forks += stats.forks;
    }

    return accumulator;
  }, { cachedCount: 0, stars: 0, subscribers: 0, forks: 0 });
  const hasCachedMetadata = totals.cachedCount > 0;

  summaryValues.stars.textContent = hasCachedMetadata ? formatNumber(totals.stars) : '—';
  summaryValues.subscribers.textContent = hasCachedMetadata ? formatNumber(totals.subscribers) : '—';
  summaryValues.forks.textContent = hasCachedMetadata ? formatNumber(totals.forks) : '—';
}

function renderRepositories() {
  repoGrid.textContent = '';

  if (currentSettings.repositories.length === 0) {
    emptyState.hidden = false;
    repoGrid.hidden = true;
    refreshButton.disabled = true;
    return;
  }

  emptyState.hidden = true;
  repoGrid.hidden = false;
  refreshButton.disabled = isRefreshing || !currentSettings.githubToken;
  currentSettings.repositories.forEach((repository) => {
    repoGrid.append(createRepositoryCard(repository, currentLatestStats[repository]));
  });
  renderSummary();
}

async function refreshRepositoryMetadata() {
  if (!currentSettings.githubToken) {
    setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata.', 'warning');
    refreshButton.disabled = true;
    return;
  }

  if (currentSettings.repositories.length === 0) return;

  isRefreshing = true;
  refreshButton.disabled = true;
  setStatus('Loading repository metadata from GitHub...', 'loading');

  const fetchedAt = new Date().toISOString();
  const results = await Promise.all(currentSettings.repositories.map(async (repository) => {
    try {
      const metadata = await fetchRepositoryMetadata(repository, currentSettings.githubToken);
      return { repository, stats: { ...metadata, fetchedAt, error: '' } };
    } catch (error) {
      const previousStats = currentLatestStats[repository];
      const stats = hasCachedMetadata(previousStats)
        ? { ...previousStats, error: error.message }
        : { repository, fetchedAt: '', error: error.message };

      return { repository, stats };
    }
  }));

  const nextLatestStats = { ...currentLatestStats };
  results.forEach(({ repository, stats }) => {
    nextLatestStats[repository] = stats;
  });
  currentLatestStats = await saveLatestStats(nextLatestStats);

  const failureCount = results.filter(({ stats }) => stats.error).length;
  const successCount = results.length - failureCount;

  if (failureCount === 0) {
    setStatus(`Last successful refresh: ${formatRefreshTime(fetchedAt)}`, 'success');
  } else if (successCount > 0) {
    setStatus(`Partial refresh: ${successCount} succeeded and ${failureCount} failed. See repository cards for details.`, 'warning');
  } else {
    setStatus('Refresh failed for all repositories. See repository cards for details.', 'error');
  }

  isRefreshing = false;
  renderRepositories();
}

async function initializeDashboard() {
  try {
    [currentSettings, currentLatestStats] = await Promise.all([getSettings(), getLatestStats()]);
    renderRepositories();

    if (currentSettings.repositories.length === 0) {
      setStatus('No repositories configured yet. Open Settings to add repositories.');
      return;
    }

    if (!currentSettings.githubToken) {
      setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata.', 'warning');
      return;
    }

    await refreshRepositoryMetadata();
  } catch (error) {
    setStatus('Unable to load dashboard data from local storage.', 'error');
    repoGrid.textContent = '';
    emptyState.hidden = false;
    repoGrid.hidden = true;
  }
}

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('empty-open-settings').addEventListener('click', openSettings);
refreshButton.addEventListener('click', refreshRepositoryMetadata);

initializeDashboard();
