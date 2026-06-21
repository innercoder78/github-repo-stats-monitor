import { getLatestStats, getSettings } from '../shared/storage.js';
import { refreshRepositoryStatsCache, refreshStatsCache } from '../shared/refresh-stats.js';
import { createSvgLineChart } from '../shared/svg-line-chart.js';
import { getRepositoryUrl } from '../shared/repository-url.js';
import { openQuickSummary } from '../shared/quick-summary.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';

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
  views: document.getElementById('total-views'),
  stars: document.getElementById('total-stars'),
  forks: document.getElementById('total-forks'),
  clones: document.getElementById('total-clones'),
};

let currentSettings = { githubToken: '', repositories: [], appearance: 'light' };
let currentLatestStats = {};
let isRefreshing = false;
let refreshingRepository = '';

applySavedAppearance();

const svgIconPaths = {
  views: [
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"></circle>',
  ].join(''),
  stars: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path>',
  forks: '<path d="M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 7v10M19 7v1a4 4 0 0 1-4 4H9a4 4 0 0 0-4 4v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
  clones: '<path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
  referrers: [
    '<circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"></circle>',
    '<path d="M3 12h7m4 0h7M12 3a14 14 0 0 1 2.2 5M12 21a14 14 0 0 1-2.2-5M8 8h8M8 16h4" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>',
    '<path d="M14 15.5h3.5a2.5 2.5 0 0 0 0-5H14m-4 0H6.5a2.5 2.5 0 0 0 0 5H10m-1-2.5h6" fill="none" stroke="currentColor" stroke-linecap="round" stroke-width="2"></path>',
  ].join(''),
};

function createIcon(name, className = 'metric-icon', size = 20) {
  const icon = document.createElement('span');
  icon.className = className;
  icon.setAttribute('aria-hidden', 'true');

  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.innerHTML = svgIconPaths[name] || '';

  icon.append(svg);
  return icon;
}

function openSettings() {
  window.location.href = chrome.runtime.getURL('src/options/options.html');
}

function formatNumber(value) {
  return Number.isFinite(value) ? value.toLocaleString() : '—';
}

function formatRefreshTime(value) {
  if (!value) return 'Not refreshed yet';
  return new Date(value).toLocaleString();
}

function formatRefreshProgressMessage(progress) {
  const completed = Number.isFinite(progress?.completed) ? progress.completed : 0;
  const total = Number.isFinite(progress?.total) ? progress.total : currentSettings.repositories.length;
  const repository = typeof progress?.repository === 'string' ? progress.repository : '';
  const baseMessage = `Refreshing repositories… ${completed} of ${total} complete.`;

  return repository ? `${baseMessage} Last updated: ${repository}.` : baseMessage;
}

function getLocalMinuteKey(date) {
  return [
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ].join('-');
}

function getValidDate(value) {
  if (!value) return null;

  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatCompactRefreshTime(date) {
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatFetchedSummary(stats) {
  const metadataFetchedAt = getValidDate(stats?.fetchedAt);
  const trafficFetchedAt = getValidDate(stats?.trafficFetchedAt);
  const clonesFetchedAt = getValidDate(stats?.clonesFetchedAt);
  const referrersFetchedAt = getValidDate(stats?.referrersFetchedAt);

  const metadataTime = metadataFetchedAt ? formatRefreshTime(metadataFetchedAt) : '—';
  const trafficTime = trafficFetchedAt ? formatRefreshTime(trafficFetchedAt) : '—';
  const clonesTime = clonesFetchedAt ? formatRefreshTime(clonesFetchedAt) : '—';
  const referrersTime = referrersFetchedAt ? formatRefreshTime(referrersFetchedAt) : '—';
  const detailedSummary = `Metadata fetched: ${metadataTime} · Traffic fetched: ${trafficTime} · Clones fetched: ${clonesTime} · Referrers fetched: ${referrersTime}`;

  if (!metadataFetchedAt || !trafficFetchedAt || !clonesFetchedAt || !referrersFetchedAt) {
    return detailedSummary;
  }

  const metadataMinute = getLocalMinuteKey(metadataFetchedAt);
  const trafficMinute = getLocalMinuteKey(trafficFetchedAt);
  const clonesMinute = getLocalMinuteKey(clonesFetchedAt);
  const referrersMinute = getLocalMinuteKey(referrersFetchedAt);

  if (metadataMinute === trafficMinute && metadataMinute === clonesMinute && metadataMinute === referrersMinute) {
    return `Data from ${formatCompactRefreshTime(metadataFetchedAt)}`;
  }

  return detailedSummary;
}

function setStatus(message, type = '') {
  statusLine.textContent = message;
  statusLine.className = `muted status-line${type ? ` ${type}` : ''}`;
}

function setRefreshButtonState() {
  const refreshInProgress = isRefreshing || Boolean(refreshingRepository);
  refreshButton.disabled = refreshInProgress || currentSettings.repositories.length === 0 || !currentSettings.githubToken;
  refreshButton.textContent = isRefreshing ? 'Refreshing…' : 'Refresh Now';
  refreshButton.setAttribute('aria-busy', String(refreshInProgress));
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

function hasCachedReferrers(stats) {
  return Boolean(stats?.referrersFetchedAt) && Array.isArray(stats.referrers);
}

function createMetric(label, value = '—', iconName = '') {
  const metric = document.createElement('div');
  metric.className = 'metric';

  const metricBody = document.createElement('span');
  metricBody.className = 'metric-body';

  const metricLabel = document.createElement('span');
  metricLabel.textContent = label;

  const metricValue = document.createElement('strong');
  metricValue.textContent = value;

  metricBody.append(metricLabel, metricValue);

  if (iconName) {
    metric.append(createIcon(iconName), metricBody);
  } else {
    metric.append(metricBody);
  }

  return metric;
}

function hasRefreshError(stats) {
  return Boolean(stats?.error || stats?.trafficError || stats?.clonesError || stats?.referrersError);
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
  heading.append(createIcon('referrers', 'section-icon', 16), document.createTextNode('Referring Sites, last 14 days'));
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

function createChartPanel(label, stats, metricKey, entriesKey = 'dailyViews') {
  const panel = document.createElement('section');
  panel.className = 'chart-panel';
  panel.setAttribute('aria-label', label);

  const heading = document.createElement('h3');
  heading.textContent = label;

  const chart = createSvgLineChart(stats?.[entriesKey], {
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

  const repositoryRefreshButton = document.createElement('button');
  const isRepositoryRefreshing = refreshingRepository === repository;
  repositoryRefreshButton.type = 'button';
  repositoryRefreshButton.className = 'repo-refresh-button secondary';
  repositoryRefreshButton.textContent = isRepositoryRefreshing ? 'Refreshing…' : 'Refresh';
  repositoryRefreshButton.disabled = isRefreshing || Boolean(refreshingRepository);
  repositoryRefreshButton.setAttribute('aria-label', `Refresh ${repository}`);
  repositoryRefreshButton.setAttribute('aria-busy', String(isRepositoryRefreshing));
  repositoryRefreshButton.addEventListener('click', () => refreshSingleRepository(repository));

  header.append(createRepositoryNameElement(repository), repositoryRefreshButton);

  const meta = document.createElement('p');
  meta.className = 'muted repo-meta';
  meta.textContent = formatFetchedSummary(stats);

  const cachedStats = hasCachedMetadata(stats) ? stats : null;
  const cachedTraffic = hasCachedTraffic(stats) ? stats : null;
  const cachedClones = hasCachedClones(stats) ? stats : null;
  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-grid';
  metricGrid.append(
    createMetric('Views, last 14 days', cachedTraffic ? formatNumber(cachedTraffic.views) : '—', 'views'),
    createMetric('Stars', cachedStats ? formatNumber(cachedStats.stars) : '—', 'stars'),
    createMetric('Forks', cachedStats ? formatNumber(cachedStats.forks) : '—', 'forks'),
    createMetric('Clones, last 14 days', cachedClones ? formatNumber(cachedClones.clones) : '—', 'clones'),
  );

  const charts = document.createElement('div');
  charts.className = 'charts';
  charts.append(
    createChartPanel('Views, last 14 days', stats, 'views'),
    createChartPanel('Clones, last 14 days', stats, 'clones', 'dailyClones'),
  );

  card.append(header, meta, metricGrid);

  const hasError = hasRefreshError(stats);
  if (hasError && (cachedStats || cachedTraffic || cachedClones || hasCachedReferrers(stats))) {
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

  if (stats?.clonesError) {
    const clonesErrorMessage = document.createElement('p');
    clonesErrorMessage.className = 'repo-error';
    clonesErrorMessage.textContent = `Clone data error: ${stats.clonesError}`;
    card.append(clonesErrorMessage);
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
  }, { metadataCount: 0, trafficCount: 0, clonesCount: 0, stars: 0, forks: 0, views: 0, clones: 0 });

  summaryValues.stars.textContent = totals.metadataCount > 0 ? formatNumber(totals.stars) : '—';
  summaryValues.forks.textContent = totals.metadataCount > 0 ? formatNumber(totals.forks) : '—';
  summaryValues.views.textContent = totals.trafficCount > 0 ? formatNumber(totals.views) : '—';
  summaryValues.clones.textContent = totals.clonesCount > 0 ? formatNumber(totals.clones) : '—';
}

function renderRepositories() {
  repoGrid.textContent = '';

  if (currentSettings.repositories.length === 0) {
    showNotice('No repositories configured yet', 'Open Settings to add repositories in the owner/repo format. Repository metadata, traffic, and clones will appear here after a token and repositories are saved.');
    setRefreshButtonState();
    return;
  }

  if (!currentSettings.githubToken) {
    showNotice('Setup needed', 'Repositories are configured, but no GitHub token is saved. Open Settings to add a token before fetching repository metadata, traffic, and clones.');
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
  if (isRefreshing || refreshingRepository) return;

  if (!currentSettings.githubToken) {
    setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata, traffic, and clones.', 'warning');
    setRefreshButtonState();
    return;
  }

  if (currentSettings.repositories.length === 0) return;

  isRefreshing = true;
  setRefreshButtonState();
  setStatus(formatRefreshProgressMessage({ completed: 0, total: currentSettings.repositories.length }), 'loading');

  try {
    const refreshResult = await refreshStatsCache(currentSettings, currentLatestStats, {
      onProgress(progress) {
        setStatus(formatRefreshProgressMessage(progress), 'loading');
      },
    });
    currentLatestStats = refreshResult.latestStats;

    const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.clonesError || stats.referrersError).length;
    const successCount = refreshResult.results.length - failureCount;

    if (failureCount === 0) {
      setStatus(`Last successful refresh: ${formatRefreshTime(refreshResult.fetchedAt)}`, 'success');
    } else if (successCount > 0) {
      setStatus(`Refresh finished with partial errors: ${successCount} repositories fully refreshed and ${failureCount} had repository, traffic, clone, or referrer errors. See repository cards for details.`, 'warning');
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

async function refreshSingleRepository(repository) {
  if (isRefreshing || refreshingRepository) return;

  if (!currentSettings.githubToken) {
    setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata, traffic, and clones.', 'warning');
    setRefreshButtonState();
    return;
  }

  if (currentSettings.repositories.length === 0 || !currentSettings.repositories.includes(repository)) return;

  refreshingRepository = repository;
  renderRepositories();
  setStatus(`Refreshing ${repository}…`, 'loading');

  try {
    const refreshResult = await refreshRepositoryStatsCache(currentSettings, currentLatestStats, repository);
    currentLatestStats = refreshResult.latestStats;

    if (hasRefreshError(refreshResult.result.stats)) {
      setStatus(`${repository} refreshed with partial errors. Cached values are shown where available.`, 'warning');
    } else {
      setStatus(`${repository} refreshed: ${formatRefreshTime(refreshResult.fetchedAt)}`, 'success');
    }
  } catch (error) {
    setStatus(`Could not refresh ${repository}. Cached values are shown where available.`, 'error');
  }

  refreshingRepository = '';
  renderRepositories();
}

async function initializeDashboard() {
  try {
    [currentSettings, currentLatestStats] = await Promise.all([getSettings(), getLatestStats()]);
    applyAppearance(currentSettings.appearance);
    renderRepositories();

    if (currentSettings.repositories.length === 0) {
      setStatus('Setup needed: no repositories configured yet. Open Settings to add repositories.', 'warning');
      return;
    }

    if (!currentSettings.githubToken) {
      setStatus('No token saved. Open Settings and add a GitHub token to fetch repository metadata, traffic, and clones.', 'warning');
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
