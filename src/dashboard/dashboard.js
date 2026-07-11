import { getAccountStats, getLatestStats, getPendingActivity, getSettings, getViewedBaselines, saveViewedBaselines } from '../shared/storage.js';
import { ACTIVITY_DELTA_LABELS, createDeltaElement } from '../shared/activity.js';
import { closeExtensionPage } from '../shared/close-page.js';
import { getRepositoryUrl } from '../shared/repository-url.js';
import { openQuickSummary } from '../shared/quick-summary.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';
import { formatDisplayTimestamp, getDefaultDisplayPreferences } from '../shared/display-format.js';

const repoGrid = document.getElementById('repo-grid');
const emptyState = document.getElementById('empty-state');
const emptyTitle = document.getElementById('empty-title');
const emptyMessage = document.getElementById('empty-message');
const summaryCard = document.getElementById('summary-card');
const statusLine = document.getElementById('status-line');
const refreshButton = document.getElementById('refresh-now');
const openQuickSummaryButton = document.getElementById('open-quick-summary');
const closeDashboardButton = document.getElementById('close-dashboard');
const quickSummaryMessage = document.getElementById('quick-summary-message');
const summaryValues = {
  views: document.getElementById('total-views'),
  stars: document.getElementById('total-stars'),
  forks: document.getElementById('total-forks'),
  clones: document.getElementById('total-clones'),
  accountFollowers: document.getElementById('account-followers'),
  watchers: document.getElementById('total-watchers'),
};

let currentSettings = { githubToken: '', repositories: [], appearance: 'light', displayPreferences: getDefaultDisplayPreferences() };
let currentLatestStats = {};
let currentAccountStats = { login: '', followers: 0, fetchedAt: '' };
let isRefreshing = false;
let refreshingRepository = '';
let currentPendingActivity = {
  account: {},
  repositories: {},
  badgeActivity: { account: false, repositories: {}, updatedAt: '' },
  updatedAt: '',
};
let currentViewedBaselines = { account: {}, repositories: {}, updatedAt: '' };

applySavedAppearance();

const svgIconPaths = {
  views: [
    '<path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
    '<circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"></circle>',
  ].join(''),
  stars: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9L12 3Z" fill="none" stroke="currentColor" stroke-linejoin="round" stroke-width="2"></path>',
  forks: '<path d="M7 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM21 5a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM7 19a2 2 0 1 1-4 0 2 2 0 0 1 4 0ZM5 7v10M19 7v1a4 4 0 0 1-4 4H9a4 4 0 0 0-4 4v1" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
  clones: '<path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
  watchers: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M13.7 21a2 2 0 0 1-3.4 0" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
  referrers: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path>',
};

function createIcon(name, className = 'metric-icon', size = 20) {
  const icon = document.createElement('span');
  icon.className = name === 'stars' ? `${className} metric-icon--stars` : className;
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
  return formatDisplayTimestamp(value, currentSettings.displayPreferences, 'full') || 'Not refreshed yet';
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
  return formatDisplayTimestamp(date, currentSettings.displayPreferences, 'full');
}

function getLatestDashboardRefreshDate() {
  const candidates = [
    currentAccountStats?.fetchedAt,
    ...Object.values(currentLatestStats || {}).flatMap((stats) => [
      stats?.fetchedAt,
      stats?.trafficFetchedAt,
      stats?.clonesFetchedAt,
      stats?.referrersFetchedAt,
    ]),
  ]
    .map(getValidDate)
    .filter(Boolean);

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, date) => (date > latest ? date : latest), candidates[0]);
}

function formatSavedDataStatus() {
  const latestRefreshDate = getLatestDashboardRefreshDate();

  if (!latestRefreshDate) {
    return 'Showing saved data. No saved refresh has completed yet. Click Refresh to update.';
  }

  return `Showing saved data. Last refreshed: ${formatRefreshTime(latestRefreshDate)}. Click Refresh to update.`;
}

function formatFetchedSummary(stats) {
  const metadataFetchedAt = getValidDate(stats?.fetchedAt);
  const trafficFetchedAt = getValidDate(stats?.trafficFetchedAt);
  const clonesFetchedAt = getValidDate(stats?.clonesFetchedAt);
  const referrersFetchedAt = getValidDate(stats?.referrersFetchedAt);
  const fetchedDates = [metadataFetchedAt, trafficFetchedAt, clonesFetchedAt, referrersFetchedAt].filter(Boolean);
  const latestFetchedAt = fetchedDates.length > 0
    ? fetchedDates.reduce((latest, date) => (date > latest ? date : latest), fetchedDates[0])
    : null;

  const metadataTime = metadataFetchedAt ? formatRefreshTime(metadataFetchedAt) : '—';
  const trafficTime = trafficFetchedAt ? formatRefreshTime(trafficFetchedAt) : '—';
  const clonesTime = clonesFetchedAt ? formatRefreshTime(clonesFetchedAt) : '—';
  const referrersTime = referrersFetchedAt ? formatRefreshTime(referrersFetchedAt) : '—';
  const detailed = `Metadata fetched: ${metadataTime} · Traffic fetched: ${trafficTime} · Clones fetched: ${clonesTime} · Referrers fetched: ${referrersTime}`;
  const visible = latestFetchedAt ? `Data from ${formatCompactRefreshTime(latestFetchedAt)}` : 'Data from —';

  return { visible, detailed };
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


function countBadgeActivityPlaces(badgeActivity) {
  const accountCount = badgeActivity?.account ? 1 : 0;
  const repositoryCount = Object.values(badgeActivity?.repositories || {}).filter(Boolean).length;

  return accountCount + repositoryCount;
}

async function updateBadgeTextFromDashboardReview(badgeActivity) {
  if (!globalThis.chrome?.action?.setBadgeText) {
    return;
  }

  try {
    const remainingCount = countBadgeActivityPlaces(badgeActivity);
    await globalThis.chrome.action.setBadgeText({ text: remainingCount > 0 ? String(remainingCount) : '' });
  } catch (error) {
    console.warn('Unable to update the extension badge after Dashboard review.', error);
  }
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

function hasCachedClones(stats) {
  return Boolean(stats?.clonesFetchedAt) && Number.isFinite(stats.clones);
}

function hasCachedReferrers(stats) {
  return Boolean(stats?.referrersFetchedAt) && Array.isArray(stats.referrers);
}

function createMetric(label, value = '—', iconName = '', activityDelta = null) {
  const metric = document.createElement('div');
  metric.className = 'metric repo-metric';

  const top = document.createElement('div');
  top.className = 'repo-metric-top';

  const metricValue = document.createElement('strong');
  metricValue.textContent = value;

  top.append(createIcon(iconName, 'metric-icon repo-metric-icon', 18), metricValue);

  const metricLabel = document.createElement('span');
  metricLabel.className = 'repo-metric-label';
  metricLabel.textContent = label;

  const activitySlot = document.createElement('div');
  activitySlot.className = 'repo-metric-activity';
  if (activityDelta && activityDelta.delta !== 0) {
    activitySlot.append(createDeltaElement(activityDelta.delta, activityDelta.label));
  }

  metric.append(top, metricLabel, activitySlot);
  return metric;
}

function createSummaryMetric(label, valueId, iconName) {
  const metric = document.createElement('div');
  metric.className = 'metric summary-metric';
  metric.append(createIcon(iconName, 'metric-icon summary-metric-icon', 22));

  const body = document.createElement('span');
  body.className = 'metric-body';
  const labelElement = document.createElement('span');
  labelElement.textContent = label;
  const value = document.createElement('strong');
  value.id = valueId;
  value.textContent = '—';
  body.append(labelElement, value);
  metric.append(body);
  return metric;
}

function hasRefreshError(stats) {
  return Boolean(stats?.error || stats?.trafficError || stats?.clonesError || stats?.referrersError);
}

function createRepositoryNameElement(repository, displayText = repository) {
  const title = document.createElement('h2');
  const repositoryUrl = getRepositoryUrl(repository);

  if (!repositoryUrl) {
    title.textContent = displayText || repository || 'Repository';
    return title;
  }

  const link = document.createElement('a');
  link.className = 'repo-title-link';
  link.href = repositoryUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = displayText;
  title.append(link);
  return title;
}

function createReferrersSection(stats) {
  const section = document.createElement('section');
  section.className = 'referrers-panel';

  const cachedReferrers = hasCachedReferrers(stats) ? stats.referrers.slice(0, 10) : null;
  const hasSuccessfulEmptyReferrers = cachedReferrers && cachedReferrers.length === 0 && !stats?.referrersError;

  const heading = document.createElement('h3');
  heading.append(
    createIcon('referrers', 'section-icon', 16),
    document.createTextNode(hasSuccessfulEmptyReferrers
      ? 'No referring sites reported for the last 14 days.'
      : 'Referring Sites, last 14 days'),
  );

  if (hasSuccessfulEmptyReferrers) {
    heading.classList.add('referrers-empty-heading');
  }

  section.append(heading);

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
    warning.textContent = 'Showing last saved referring sites because the latest referrers request failed. GitHub traffic data covers the last 14 days.';
    section.append(warning);
  }

  if (!cachedReferrers || cachedReferrers.length === 0) {
    return section;
  }

  const list = document.createElement('div');
  list.className = 'referrers-list';

  cachedReferrers.forEach((entry) => {
    const row = document.createElement('p');
    row.className = 'referrer-row';

    const referrer = document.createElement('span');
    referrer.className = 'referrer-name';
    referrer.textContent = entry.referrer;

    const summary = document.createElement('span');
    summary.className = 'referrer-summary';
    const viewLabel = entry.count === 1 ? 'view' : 'views';
    const uniqueLabel = entry.uniques === 1 ? 'unique visitor' : 'unique visitors';
    summary.textContent = ` — ${formatNumber(entry.count)} ${viewLabel}, ${formatNumber(entry.uniques)} ${uniqueLabel}`;

    row.append(referrer, summary);
    list.append(row);
  });

  section.append(list);
  return section;
}



function hasFetchedAccountStats(accountStats) {
  return Boolean(accountStats?.login)
    && Boolean(accountStats?.fetchedAt)
    && Number.isFinite(accountStats.followers);
}

function hasCurrentAccountViewedBaseline() {
  return hasFetchedAccountStats(currentAccountStats)
    && currentViewedBaselines.dashboard?.account?.login === currentAccountStats.login
    && Number.isFinite(Number(currentViewedBaselines.dashboard?.account?.followers));
}

function getBaselineDelta(baseline, key, currentValue) {
  if (!Number.isFinite(currentValue)) {
    return 0;
  }

  const baselineValue = Number(baseline?.[key]);
  return Number.isFinite(baselineValue) ? currentValue - baselineValue : 0;
}

function createSummaryDeltaElement(delta) {
  const numericDelta = Number(delta) || 0;
  const deltaElement = document.createElement('span');
  deltaElement.className = `summary-delta ${numericDelta > 0 ? 'summary-delta-positive' : 'summary-delta-negative'}`;
  deltaElement.textContent = `${numericDelta > 0 ? '+' : '-'}${Math.abs(numericDelta)}`;
  return deltaElement;
}

function setSummaryValue(valueElement, value, delta = 0) {
  valueElement.replaceChildren(document.createTextNode(value));

  if (delta !== 0) {
    valueElement.append(createSummaryDeltaElement(delta));
  }
}

function getRepositoryPendingDeltaMap(repository) {
  const activity = (currentPendingActivity.dashboard?.inFlight || currentPendingActivity.dashboard?.queued || {}).repositories?.[repository];
  const deltas = {
    stars: { delta: Number(activity?.starsDelta) || 0, label: ACTIVITY_DELTA_LABELS.starsDelta },
    forks: { delta: Number(activity?.forksDelta) || 0, label: ACTIVITY_DELTA_LABELS.forksDelta },
    watchers: { delta: Number(activity?.repoWatchersDelta) || 0, label: 'Watcher' },
  };

  return Object.fromEntries(Object.entries(deltas).filter(([, value]) => value.delta !== 0));
}

function preferPendingDeltaMap(pendingMap, viewedMap) {
  return ['stars', 'forks', 'watchers'].reduce((deltaMap, key) => {
    const preferredDelta = pendingMap[key] || viewedMap[key];

    if (preferredDelta) {
      deltaMap[key] = preferredDelta;
    }

    return deltaMap;
  }, {});
}

function getRepositoryVisibleDeltaMap(repository, stats) {
  return preferPendingDeltaMap(getRepositoryPendingDeltaMap(repository), getRepositoryViewedDeltaMap(repository, stats));
}

function getRepositoryViewedDeltaMap(repository, stats) {
  if (!hasCachedMetadata(stats)) {
    return {};
  }

  const baseline = currentViewedBaselines.dashboard?.repositories?.[repository];
  const deltas = {
    stars: { delta: getBaselineDelta(baseline, 'stars', stats.stars), label: ACTIVITY_DELTA_LABELS.starsDelta },
    forks: { delta: getBaselineDelta(baseline, 'forks', stats.forks), label: ACTIVITY_DELTA_LABELS.forksDelta },
    watchers: { delta: getBaselineDelta(baseline, 'repoWatchers', stats.subscribers), label: 'Watcher' },
  };

  return Object.fromEntries(Object.entries(deltas).filter(([, value]) => value.delta !== 0));
}

function getVisibleRepositorySummaryDeltas() {
  return currentSettings.repositories.reduce((accumulator, repository) => {
    const deltaMap = getRepositoryVisibleDeltaMap(repository, currentLatestStats[repository]);
    accumulator.stars += Number(deltaMap.stars?.delta) || 0;
    accumulator.forks += Number(deltaMap.forks?.delta) || 0;
    accumulator.watchers += Number(deltaMap.watchers?.delta) || 0;
    return accumulator;
  }, { stars: 0, forks: 0, watchers: 0 });
}

function getAccountFollowersDelta() {
  if (!hasCurrentAccountViewedBaseline()) {
    return 0;
  }

  return getBaselineDelta(currentViewedBaselines.dashboard?.account, 'followers', currentAccountStats.followers);
}

function getVisibleAccountFollowersDelta() {
  const pendingDelta = Number((currentPendingActivity.dashboard?.inFlight || currentPendingActivity.dashboard?.queued || {}).account?.followersDelta) || 0;
  return pendingDelta !== 0 ? pendingDelta : getAccountFollowersDelta();
}

function getDashboardDeliveryToken() {
  return currentPendingActivity.dashboard?.inFlight?.token || '';
}

async function markDashboardActivityShown(renderedRepositories, displayedAccountActivity) {
  if (renderedRepositories.size === 0 && !displayedAccountActivity) return;
  const token = getDashboardDeliveryToken();
  const displayedActivity = { account: displayedAccountActivity, repositories: {} };
  renderedRepositories.forEach((repository) => {
    const activity = currentPendingActivity.dashboard?.inFlight?.repositories?.[repository];
    if (activity) displayedActivity.repositories[repository] = activity;
  });
  try {
    const response = await chrome.runtime.sendMessage({ action: 'activity.acknowledge', surface: 'dashboard', token, displayedActivity });
    if (response?.ok && response.result?.pendingActivity) currentPendingActivity = response.result.pendingActivity;
    if (response?.ok) await updateBadgeTextFromDashboardReview(response.result.pendingActivity.badgeActivity);
  } catch (error) {
    console.warn('Unable to mark Dashboard activity as shown.', error);
  }
}


async function saveDashboardViewedBaselines(renderedRepositories, displayedAccount) {
  const viewedAt = new Date().toISOString();
  const nextViewedBaselines = {
    ...currentViewedBaselines,
    dashboard: {
      ...(currentViewedBaselines.dashboard || {}),
      account: { ...(currentViewedBaselines.dashboard?.account || {}) },
      repositories: { ...(currentViewedBaselines.dashboard?.repositories || {}) },
      updatedAt: viewedAt,
    },
    updatedAt: viewedAt,
  };

  renderedRepositories.forEach((repository) => {
    const stats = currentLatestStats[repository];

    if (hasCachedMetadata(stats)) {
      nextViewedBaselines.dashboard.repositories[repository] = {
        ...(nextViewedBaselines.dashboard.repositories[repository] || {}),
        repository,
        stars: stats.stars,
        forks: stats.forks,
        repoWatchers: stats.subscribers,
        updatedAt: viewedAt,
      };
    }
  });

  if (displayedAccount && hasFetchedAccountStats(currentAccountStats)) {
    nextViewedBaselines.dashboard.account = {
      login: currentAccountStats.login,
      followers: currentAccountStats.followers,
      updatedAt: viewedAt,
    };
  }

  try {
    currentViewedBaselines = await saveViewedBaselines(nextViewedBaselines);
  } catch (error) {
    console.warn('Unable to save Dashboard viewed baselines.', error);
  }
}

function createRepositoryIdentity(repository, stats) {
  const identity = document.createElement('div');
  identity.className = 'repo-identity';

  const iconBlock = document.createElement('span');
  iconBlock.className = 'repo-icon-block';
  iconBlock.append(createIcon('referrers', 'repo-icon-glyph', 24));

  const text = document.createElement('div');
  text.className = 'repo-identity-text';

  const [owner = '', name = repository] = repository.split('/');
  const displayName = name || repository;
  const title = createRepositoryNameElement(repository, displayName);
  title.classList.add('repo-name');

  const fullName = document.createElement('p');
  fullName.className = 'repo-full-name';
  fullName.textContent = repository;

  const fetched = document.createElement('p');
  fetched.className = 'repo-fetched-line';
  const fetchedSummary = formatFetchedSummary(stats);
  fetched.title = fetchedSummary.detailed;
  fetched.setAttribute('aria-label', fetchedSummary.detailed);
  const dot = document.createElement('span');
  dot.className = 'repo-fetched-dot';
  dot.setAttribute('aria-hidden', 'true');
  fetched.append(dot, document.createTextNode(fetchedSummary.visible));

  text.append(title, fullName, fetched);
  identity.append(iconBlock, text);
  return identity;
}

function createRepositoryCard(repository, stats) {
  const card = document.createElement('article');
  card.className = 'card repo-card';
  const deltaMap = getRepositoryVisibleDeltaMap(repository, stats);

  if (Object.keys(deltaMap).length > 0) {
    card.classList.add('activity-highlight');
  }

  const mainRow = document.createElement('div');
  mainRow.className = 'repo-main-row';

  const repositoryRefreshButton = document.createElement('button');
  const isRepositoryRefreshing = refreshingRepository === repository;
  repositoryRefreshButton.type = 'button';
  repositoryRefreshButton.className = 'repo-refresh-button secondary';
  repositoryRefreshButton.textContent = isRepositoryRefreshing ? '⟳' : '↻';
  repositoryRefreshButton.disabled = isRefreshing || Boolean(refreshingRepository);
  repositoryRefreshButton.title = isRepositoryRefreshing ? `Refreshing ${repository}` : `Refresh ${repository}`;
  repositoryRefreshButton.setAttribute('aria-label', isRepositoryRefreshing ? `Refreshing ${repository}` : `Refresh ${repository}`);
  repositoryRefreshButton.setAttribute('aria-busy', String(isRepositoryRefreshing));
  repositoryRefreshButton.addEventListener('click', () => refreshSingleRepository(repository));

  const left = document.createElement('div');
  left.className = 'repo-left';
  left.append(createRepositoryIdentity(repository, stats), repositoryRefreshButton);

  const cachedStats = hasCachedMetadata(stats) ? stats : null;
  const cachedTraffic = hasCachedTraffic(stats) ? stats : null;
  const cachedClones = hasCachedClones(stats) ? stats : null;
  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-grid repo-metrics';
  metricGrid.append(
    createMetric('Watchers', cachedStats ? formatNumber(cachedStats.subscribers) : '—', 'watchers', deltaMap.watchers),
    createMetric('Stars', cachedStats ? formatNumber(cachedStats.stars) : '—', 'stars', deltaMap.stars),
    createMetric('Forks', cachedStats ? formatNumber(cachedStats.forks) : '—', 'forks', deltaMap.forks),
    createMetric('Views', cachedTraffic ? formatNumber(cachedTraffic.views) : '—', 'views'),
    createMetric('Clones', cachedClones ? formatNumber(cachedClones.clones) : '—', 'clones'),
  );

  mainRow.append(left, metricGrid);
  card.append(mainRow);

  const hasError = hasRefreshError(stats);
  if (hasError && (cachedStats || cachedTraffic || cachedClones || hasCachedReferrers(stats))) {
    const cachedNotice = document.createElement('p');
    cachedNotice.className = 'repo-cache-note';
    cachedNotice.textContent = 'Some data could not be refreshed. Last saved values are shown where available.';
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

  card.append(createReferrersSection(stats));
  return card;
}

function renderSummary() {
  const totals = currentSettings.repositories.reduce((accumulator, repository) => {
    const stats = currentLatestStats[repository];

    if (hasCachedMetadata(stats)) {
      accumulator.metadataCount += 1;
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
  }, { metadataCount: 0, trafficCount: 0, clonesCount: 0, stars: 0, forks: 0, watchers: 0, views: 0, clones: 0 });

  const summaryDeltas = getVisibleRepositorySummaryDeltas();
  const followersDelta = getVisibleAccountFollowersDelta();

  setSummaryValue(summaryValues.stars, totals.metadataCount > 0 ? formatNumber(totals.stars) : '—', summaryDeltas.stars);
  setSummaryValue(summaryValues.forks, totals.metadataCount > 0 ? formatNumber(totals.forks) : '—', summaryDeltas.forks);
  setSummaryValue(summaryValues.accountFollowers, hasFetchedAccountStats(currentAccountStats) ? formatNumber(currentAccountStats.followers) : '—', followersDelta);
  setSummaryValue(summaryValues.watchers, totals.metadataCount > 0 ? formatNumber(totals.watchers) : '—', summaryDeltas.watchers);
  setSummaryValue(summaryValues.views, totals.trafficCount > 0 ? formatNumber(totals.views) : '—');
  setSummaryValue(summaryValues.clones, totals.clonesCount > 0 ? formatNumber(totals.clones) : '—');

  const accountMetric = summaryValues.accountFollowers.closest('.metric');
  accountMetric?.classList.remove('activity-highlight');

  if (followersDelta !== 0) {
    accountMetric?.classList.add('activity-highlight');
  }

  return hasFetchedAccountStats(currentAccountStats);
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
  const displayedRepositories = new Set();
  currentSettings.repositories.forEach((repository) => {
    const card = createRepositoryCard(repository, currentLatestStats[repository]);
    displayedRepositories.add(repository);
    repoGrid.append(card);
  });
  const displayedAccountActivity = renderSummary();
  markDashboardActivityShown(displayedRepositories, displayedAccountActivity);
  saveDashboardViewedBaselines(displayedRepositories, displayedAccountActivity);
}



function requestRefresh(action, payload = {}) {
  return chrome.runtime.sendMessage({ action, ...payload }).then((response) => {
    if (!response?.ok) {
      throw new Error(response?.error || 'Refresh failed.');
    }
    return response.result;
  });
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.action === 'refreshStats.progress' && message.source === 'dashboard' && isRefreshing) {
    setStatus(formatRefreshProgressMessage(message.progress), 'loading');
  }
});


async function handleSkippedFullRefreshResult(refreshResult) {
  await reloadSavedRefreshData();

  if (refreshResult?.reason === 'completed-recently') {
    setStatus('Showing recently refreshed data.', 'success');
    return;
  }

  if (refreshResult?.reason === 'running') {
    setStatus('Another refresh is already in progress. Current saved data is shown. Refresh again after it finishes.', 'warning');
    return;
  }

  if (refreshResult?.reason === 'invalid-repository') {
    setStatus('Refresh could not finish. Last saved values are shown where available.', 'error');
    return;
  }

  setStatus('Refresh could not start. Current saved data is shown.', 'warning');
}

async function handleSkippedRepositoryRefreshResult(refreshResult, repository) {
  await reloadSavedRefreshData();

  if (refreshResult?.reason === 'completed-recently') {
    setStatus(`Showing recently refreshed data for ${repository}.`, 'success');
    return;
  }

  if (refreshResult?.reason === 'running') {
    setStatus(`Another refresh is already in progress. Current saved data for ${repository} is shown.`, 'warning');
    return;
  }

  if (refreshResult?.reason === 'invalid-repository') {
    setStatus(`Could not refresh ${repository}. Last saved values are shown where available.`, 'error');
    return;
  }

  setStatus(`Refresh could not start for ${repository}. Current saved data is shown.`, 'warning');
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

async function reloadSavedRefreshData() {
  [currentLatestStats, currentAccountStats, currentPendingActivity, currentViewedBaselines] = await Promise.all([
    getLatestStats(),
    getAccountStats(),
    getPendingActivity(),
    getViewedBaselines(),
  ]);
  await claimDashboardActivity();
  await claimDashboardActivity();
  renderRepositories();
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
    const refreshResult = await requestRefresh('refreshStats.full', { source: 'dashboard' });
    if (refreshResult.skipped) {
      await handleSkippedFullRefreshResult(refreshResult);
    } else {
      currentLatestStats = refreshResult.latestStats;
      currentAccountStats = refreshResult.accountStats;
      if (refreshResult.pendingActivity) {
        currentPendingActivity = refreshResult.pendingActivity;
      }

      const failureCount = refreshResult.results.filter(({ stats }) => stats.error || stats.trafficError || stats.clonesError || stats.referrersError).length;
      const successCount = refreshResult.results.length - failureCount;

      const refreshSummary = formatRepositoryRefreshSummary(refreshResult);
      if (failureCount === 0) {
        setStatus(refreshSummary || `Last successful refresh: ${formatRefreshTime(refreshResult.fetchedAt)}`, 'success');
      } else if (successCount > 0) {
        setStatus(`${refreshSummary ? `${refreshSummary} ` : ''}Refresh finished with partial errors: ${successCount} repositories fully refreshed, and ${failureCount} had repository, traffic, clone, or referrer errors. Last saved values are shown where available.`, 'warning');
      } else {
        setStatus(`${refreshSummary ? `${refreshSummary} ` : ''}Refresh finished with errors for all refreshed repositories. Last saved values are shown where available.`, 'error');
      }
    }
  } catch (error) {
    setStatus(error.message === 'No repositories configured. Open Settings and add at least one repository.'
      ? 'Setup needed: no repositories configured yet. Open Settings to add repositories.'
      : 'Refresh could not finish. Last saved values are shown where available.', 'error');
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
    const refreshResult = await requestRefresh('refreshStats.repository', { repository });
    if (refreshResult.skipped) {
      await handleSkippedRepositoryRefreshResult(refreshResult, repository);
    } else {
      currentLatestStats = refreshResult.latestStats;
      if (refreshResult.pendingActivity) {
        currentPendingActivity = refreshResult.pendingActivity;
      }

      if (hasRefreshError(refreshResult.result.stats)) {
        setStatus(`${repository} refreshed with partial errors. Last saved values are shown where available.`, 'warning');
      } else {
        setStatus(`${repository} refreshed: ${formatRefreshTime(refreshResult.fetchedAt)}`, 'success');
      }
    }
  } catch (error) {
    setStatus(`Could not refresh ${repository}. Last saved values are shown where available.`, 'error');
  }

  refreshingRepository = '';
  renderRepositories();
}

async function initializeDashboard() {
  try {
    [currentSettings, currentLatestStats, currentAccountStats, currentPendingActivity, currentViewedBaselines] = await Promise.all([getSettings(), getLatestStats(), getAccountStats(), getPendingActivity(), getViewedBaselines()]);
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

    setStatus(formatSavedDataStatus());
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
closeDashboardButton.addEventListener('click', closeExtensionPage);

initializeDashboard();
