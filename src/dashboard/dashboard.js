import { getLatestStats, getSettings } from '../shared/storage.js';
import { refreshStatsCache } from '../shared/refresh-stats.js';
import { createSvgBarChart } from '../shared/svg-bar-chart.js';
import { getRepositoryUrl } from '../shared/repository-url.js';
import { openQuickSummary } from '../shared/quick-summary.js';

const repoGrid = document.getElementById('repo-grid');
const emptyState = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptyMessage = document.getElementById('empty-message');
const summaryCard = document.getElementById('summary-card');
const statusLine = document.getElementById('status-line');
const refreshButton = document.getElementById('refresh-now');
const openQuickSummaryButton = document.getElementById('open-quick-summary');
const quickSummaryMessage = document.getElementById('quick-summary-message');
const summaryValues = {
  stars: document.getElementById('total-stars'),
  subscribers: document.getElementById('total-subscribers'),
  forks: document.getElementById('total-forks'),
  views: document.getElementById('total-views'),
  uniqueVisitors: document.getElementById('total-unique-visitors'),
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

function setRefreshButtonState() {
  refreshButton.disabled = isRefreshing || currentSettings.repositories.length === 0 || !currentSettings.githubToken;
  refreshButton.textContent = isRefreshing ? 'Refreshing…' : 'Refresh Now';
  refreshButton.setAttribute('aria-busy', String(isRefreshing));
}

function showNotice(title, message) {
  emptyTitle.textContent = title;
  emptyMessage.textContent = message;
  emptyState.hidden = false;
  repoGrid.hidden = true;
  summaryCard.hidden = true;
}

function hideNotice() {
  emptyState.hidden = true;
  repoGrid.hidden = false;
  summaryCard.hidden = false;
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

function hasCachedReferrers(stats) {
  return Boolean(stats?.referrersFetchedAt) && Array.isArray(stats.referrers);
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

function createRepositoryNameElement(repository) {
  const title = document.createElement('h2');
  const repositoryUrl = getRepositoryUrl(repository);

  if (!repositoryUrl) {
    title.textContent = repository || 'Repository';
    return title;
  }

  const link = document.createElement('a');
  link.className = 'repo-title-link';
  link.href = repositoryUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = repository;
  title.append(link);
  return title;
}

function createReferrersSection(stats) {
  const section = document.createElement('section');
  section.className = 'referrers-panel';

  const heading = document.createElement('h3');
  heading.textContent = 'Referring sites, last 14 days';
  section.append(heading);

  const cachedReferrers = hasCachedReferrers(stats) ? stats.referrers.slice(0, 10) : null;

  if (stats?.referrersError && !cachedReferrers) {
    const error = document.createElement('p');
    error.className = 'referrers-message error';
    error.textContent = `Referring sites error: ${stats.referrersError}`;
    section.append(error);
    return section;
  }

  if (stats?.referrersError && cachedReferrers) {
    const warning = document.createElement('p');
    warning.className = 'referrers-message warning';
    warning.textContent = 'Showing last saved referring sites because the latest referrers request failed.';
    section.append(warning);
  }

  if (!cachedReferrers || cachedReferrers.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'referrers-message';
    empty.textContent = 'No referring sites reported for the last 14 days.';
    section.append(empty);
    return section;
  }

  const list = document.createElement('div');
  list.className = 'referrers-list';

  const header = document.createElement('div');
  header.className = 'referrer-row referrer-row-header';
  header.append(
    Object.assign(document.createElement('span'), { textContent: 'Referrer' }),
    Object.assign(document.createElement('span'), { textContent: 'Views' }),
    Object.assign(document.createElement('span'), { textContent: 'Unique visitors' }),
  );
  list.append(header);

  cachedReferrers.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'referrer-row';
    row.append(
      Object.assign(document.createElement('span'), { textContent: entry.referrer }),
      Object.assign(document.createElement('span'), { textContent: formatNumber(entry.count) }),
      Object.assign(document.createElement('span'), { textContent: formatNumber(entry.uniques) }),
    );
    list.append(row);
  });

  section.append(list);
  return section;
}

function createChartPanel(label, stats, metricKey) {
  const panel = document.createElement('section');
  panel.className = 'chart-panel';
  panel.setAttribute('aria-label', label);

  const heading = document.createElement('h3');
  heading.textContent = label;

  const chart = createSvgBarChart(stats?.dailyViews, {
    metricKey,
    metricLabel: label.replace(', last 14 days', ''),
    title: `${label} for ${stats?.repository || 'repository'}`,
  });

  panel.append(heading, chart);
  return panel;
}

function createRepositoryCard(repository, stats) {
  const card = document.createElement('article');
  card.className = 'card repo-card';

  const header = document.createElement('div');
  header.className = 'repo-card-header';

  header.append(createRepositoryNameElement(repository));

  const meta = document.createElement('p');
  meta.className = 'muted repo-meta';
  const metadataTime = stats?.fetchedAt ? formatRefreshTime(stats.fetchedAt) : '—';
  const trafficTime = stats?.trafficFetchedAt ? formatRefreshTime(stats.trafficFetchedAt) : '—';
  const referrersTime = stats?.referrersFetchedAt ? formatRefreshTime(stats.referrersFetchedAt) : '—';
  meta.textContent = `Metadata fetched: ${metadataTime} · Traffic fetched: ${trafficTime} · Referrers fetched: ${referrersTime}`;

  const cachedStats = hasCachedMetadata(stats) ? stats : null;
  const cachedTraffic = hasCachedTraffic(stats) ? stats : null;
  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-grid';
  metricGrid.append(
    createMetric('Stars', cachedStats ? formatNumber(cachedStats.stars) : '—'),
    createMetric('Real watchers', cachedStats ? formatNumber(cachedStats.subscribers) : '—'),
    createMetric('Forks', cachedStats ? formatNumber(cachedStats.forks) : '—'),
    createMetric('Views, last 14 days', cachedTraffic ? formatNumber(cachedTraffic.views) : '—'),
    createMetric('Unique visitors, last 14 days', cachedTraffic ? formatNumber(cachedTraffic.uniqueVisitors) : '—'),
  );

  const charts = document.createElement('div');
  charts.className = 'charts';
  charts.append(
    createChartPanel('Views, last 14 days', stats, 'views'),
    createChartPanel('Unique visitors, last 14 days', stats, 'uniqueVisitors'),
  );

  card.append(header, meta, metricGrid);

  const hasError = Boolean(stats?.error || stats?.trafficError || stats?.referrersError);
  if (hasError && (cachedStats || cachedTraffic || hasCachedReferrers(stats))) {
    const cachedNotice = document.createElement('p');
    cachedNotice.className = 'repo-cache-note';
    cachedNotice.textContent = 'Showing last saved values.';
    card.append(cachedNotice);
  }

  if (stats?.error) {
    const errorMessage = document.createElement('p');
    errorMessage.className = 'repo-error';
    errorMessage.textContent = `Repository data error: ${stats.error}`;
    card.append(errorMessage);
  }

  if (stats?.trafficError) {
    const trafficErrorMessage = document.createElement('p');
    trafficErrorMessage.className = 'repo-error';
    trafficErrorMessage.textContent = `Traffic data error: ${stats.trafficError}`;
    card.append(trafficErrorMessage);
  }

  card.append(charts, createReferrersSection(stats));
  return card;
}

function renderSummary() {
  const totals = currentSettings.repositories.reduce((accumulator, repository) => {
    const stats = currentLatestStats[repository];

    if (hasCachedMetadata(stats)) {
      accumulator.metadataCount += 1;
      accumulator.stars += stats.stars;
      accumulator.subscribers += stats.subscribers;
      accumulator.forks += stats.forks;
    }

    if (hasCachedTraffic(stats)) {
      accumulator.trafficCount += 1;
      accumulator.views += stats.views;
      accumulator.uniqueVisitors += stats.uniqueVisitors;
    }

    return accumulator;
  }, { metadataCount: 0, trafficCount: 0, stars: 0, subscribers: 0, forks: 0, views: 0, uniqueVisitors: 0 });

  summaryValues.stars.textContent = totals.metadataCount > 0 ? formatNumber(totals.stars) : '—';
  summaryValues.subscribers.textContent = totals.metadataCount > 0 ? formatNumber(totals.subscribers) : '—';
  summaryValues.forks.textContent = totals.metadataCount > 0 ? formatNumber(totals.forks) : '—';
  summaryValues.views.textContent = totals.trafficCount > 0 ? formatNumber(totals.views) : '—';
  summaryValues.uniqueVisitors.textContent = totals.trafficCount > 0 ? formatNumber(totals.uniqueVisitors) : '—';
}

function renderRepositories() {
  repoGrid.textContent = '';

  if (currentSettings.repositories.length === 0) {
    showNotice('No repositories configured yet', 'Open Settings to add repositories in the owner/repo format. Repository metadata and traffic will appear here after a token and repositories are saved.');
    setRefreshButtonState();
    return;
  }

  if (!currentSettings.githubToken) {
    showNotice('Setup needed', 'Repositories are configured, but no GitHub token is saved. Open Settings to add a token before fetching repository metadata and traffic.');
    renderSummary();
    setRefreshButtonState();
    return;
  }

  hideNotice();
  setRefreshButtonState();
  currentSettings.repositories.forEach((repository) => {
    repoGrid.append(createRepositoryCard(repository, currentLatestStats[repository]));
  });
  renderSummary();
}

async function refreshRepositoryStats() {
  if (isRefreshing) return;

  if (!currentSettings.githubToken) {
    setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata and traffic.', 'warning');
    setRefreshButtonState();
    return;
  }

  if (currentSettings.repositories.length === 0) return;

  isRefreshing = true;
  setRefreshButtonState();
  setStatus('Loading repository metadata, traffic, and referrers from GitHub…', 'loading');

  try {
    const refreshResult = await refreshStatsCache(currentSettings, currentLatestStats);
    currentLatestStats = refreshResult.latestStats;

    const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.referrersError).length;
    const successCount = refreshResult.results.length - failureCount;

    if (failureCount === 0) {
      setStatus(`Last successful refresh: ${formatRefreshTime(refreshResult.fetchedAt)}`, 'success');
    } else if (successCount > 0) {
      setStatus(`Refresh finished with partial errors: ${successCount} repositories fully refreshed and ${failureCount} had repository, traffic, or referrer errors. See repository cards for details.`, 'warning');
    } else {
      setStatus('Refresh finished with errors for all repositories. Cached values are shown where available.', 'error');
    }
  } catch (error) {
    setStatus(error.message === 'No repositories configured. Open Settings and add at least one repository.'
      ? 'Setup needed: no repositories configured yet. Open Settings to add repositories.'
      : 'Refresh could not finish. Cached values are shown where available.', 'error');
  }

  isRefreshing = false;
  renderRepositories();
}

async function initializeDashboard() {
  try {
    [currentSettings, currentLatestStats] = await Promise.all([getSettings(), getLatestStats()]);
    renderRepositories();

    if (currentSettings.repositories.length === 0) {
      setStatus('Setup needed: no repositories configured yet. Open Settings to add repositories.', 'warning');
      return;
    }

    if (!currentSettings.githubToken) {
      setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata and traffic.', 'warning');
      return;
    }

    await refreshRepositoryStats();
  } catch (error) {
    setStatus('Unable to load dashboard data from local storage.', 'error');
    repoGrid.textContent = '';
    showNotice('Dashboard unavailable', 'Unable to load saved settings or cached repository data from local storage.');
    setRefreshButtonState();
  }
}

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('empty-open-settings').addEventListener('click', openSettings);
refreshButton.addEventListener('click', refreshRepositoryStats);
openQuickSummaryButton.addEventListener('click', () => openQuickSummary(quickSummaryMessage));

initializeDashboard();
