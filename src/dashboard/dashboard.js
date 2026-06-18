import { getSettings } from '../shared/storage.js';

const repoGrid = document.getElementById('repo-grid');
const emptyState = document.getElementById('empty-state');

function openSettings() {
  chrome.runtime.openOptionsPage();
}

function createMetric(label) {
  const metric = document.createElement('div');
  metric.className = 'metric';

  const metricLabel = document.createElement('span');
  metricLabel.textContent = label;

  const value = document.createElement('strong');
  value.textContent = '—';

  metric.append(metricLabel, value);
  return metric;
}

function createRepositoryCard(repository) {
  const card = document.createElement('article');
  card.className = 'card repo-card';

  const title = document.createElement('h2');
  title.textContent = repository;

  const metricGrid = document.createElement('div');
  metricGrid.className = 'metric-grid';
  ['Stars', 'Real watchers', 'Forks', 'Views, last 14 days', 'Unique visitors, last 14 days'].forEach((label) => {
    metricGrid.append(createMetric(label));
  });

  const charts = document.createElement('div');
  charts.className = 'charts';
  ['Views, last 14 days', 'Unique visitors, last 14 days'].forEach((label) => {
    const placeholder = document.createElement('div');
    placeholder.className = 'chart-placeholder';
    placeholder.textContent = label;
    charts.append(placeholder);
  });

  card.append(title, metricGrid, charts);
  return card;
}

async function renderRepositories() {
  try {
    const settings = await getSettings();
    repoGrid.textContent = '';

    if (settings.repositories.length === 0) {
      emptyState.hidden = false;
      repoGrid.hidden = true;
      return;
    }

    emptyState.hidden = true;
    repoGrid.hidden = false;
    settings.repositories.forEach((repository) => {
      repoGrid.append(createRepositoryCard(repository));
    });
  } catch (error) {
    repoGrid.textContent = '';
    emptyState.hidden = false;
    repoGrid.hidden = true;
  }
}

document.getElementById('open-settings').addEventListener('click', openSettings);
document.getElementById('empty-open-settings').addEventListener('click', openSettings);

renderRepositories();
