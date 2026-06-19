import { fetchRepositoryMetadata, fetchRepositoryTrafficViews } from '../shared/github-api.js';
import { getSettings, isValidRepositoryName, normalizeRepositoryName, saveSettings } from '../shared/storage.js';

const MAX_REPOSITORIES = 20;

const form = document.getElementById('settings-form');
const tokenInput = document.getElementById('github-token');
const repositoryList = document.getElementById('repository-list');
const addRepositoryButton = document.getElementById('add-repository');
const resetButton = document.getElementById('reset-settings');
const testConnectionButton = document.getElementById('test-connection');
const repoMessage = document.getElementById('repo-message');
const statusMessage = document.getElementById('status-message');
const testMessage = document.getElementById('test-message');
const testResults = document.getElementById('test-results');

let isTestingConnection = false;

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function clearTestResults() {
  setMessage(testMessage, '', '');
  testResults.textContent = '';
}

function getRepositoryInputs() {
  return Array.from(repositoryList.querySelectorAll('.repository-input'));
}

function updateAddButtonState() {
  const rowCount = getRepositoryInputs().length;
  addRepositoryButton.disabled = rowCount >= MAX_REPOSITORIES;
  addRepositoryButton.title = rowCount >= MAX_REPOSITORIES ? 'Maximum of 20 repositories reached.' : '';
}

function createRepositoryRow(value = '', shouldFocus = false) {
  const row = document.createElement('div');
  row.className = 'repository-row';

  const label = document.createElement('label');
  label.className = 'repository-label';
  label.textContent = 'Repository';

  const input = document.createElement('input');
  input.className = 'repository-input';
  input.type = 'text';
  input.placeholder = 'owner/repo or https://github.com/owner/repo';
  input.value = value;

  const removeButton = document.createElement('button');
  removeButton.className = 'secondary remove-repository';
  removeButton.type = 'button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    const nextFocusTarget = row.nextElementSibling?.querySelector('.repository-input')
      || row.previousElementSibling?.querySelector('.repository-input')
      || addRepositoryButton;
    row.remove();
    if (getRepositoryInputs().length === 0) {
      addRepositoryRow('', true);
    } else {
      nextFocusTarget.focus();
    }
    setMessage(repoMessage, '', '');
    setMessage(statusMessage, '', '');
    clearTestResults();
    updateAddButtonState();
  });

  label.append(input);
  row.append(label, removeButton);
  repositoryList.append(row);
  updateAddButtonState();

  if (shouldFocus) {
    input.focus();
  }
}

function addRepositoryRow(value = '', shouldFocus = false) {
  if (getRepositoryInputs().length >= MAX_REPOSITORIES) {
    setMessage(repoMessage, 'You can configure up to 20 repositories.', 'error');
    updateAddButtonState();
    return;
  }

  createRepositoryRow(value, shouldFocus);
}

function renderRepositories(repositories) {
  repositoryList.textContent = '';
  const values = repositories.length > 0 ? repositories : [''];
  values.forEach((value) => addRepositoryRow(value));
  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();
  updateAddButtonState();
}

function validateRepositories() {
  const rawValues = getRepositoryInputs().map((input) => input.value);
  const normalizedValues = rawValues.map(normalizeRepositoryName);
  const filledValues = normalizedValues.filter(Boolean);

  if (filledValues.length === 0) {
    return { isValid: true, repositories: [] };
  }

  if (normalizedValues.some((value) => !value)) {
    return {
      isValid: false,
      message: 'Remove empty repository rows before saving, or leave all repository rows empty.',
    };
  }

  const invalidValue = filledValues.find((value) => !isValidRepositoryName(value));
  if (invalidValue) {
    return {
      isValid: false,
      message: `Invalid repository "${invalidValue}". Use owner/repo or a GitHub repository URL, for example innercoder78/github-repo-stats-monitor or https://github.com/innercoder78/github-repo-stats-monitor.`,
    };
  }

  const seen = new Set();
  const duplicateValue = filledValues.find((value) => {
    if (seen.has(value)) {
      return true;
    }
    seen.add(value);
    return false;
  });

  if (duplicateValue) {
    return {
      isValid: false,
      message: `Duplicate repository "${duplicateValue}". Each repository can only be listed once.`,
    };
  }

  if (filledValues.length > MAX_REPOSITORIES) {
    return { isValid: false, message: 'You can configure up to 20 repositories.' };
  }

  return { isValid: true, repositories: filledValues };
}


function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Unable to complete this GitHub request.';
  return message || 'Unable to complete this GitHub request.';
}

function createStatusLine(label, result) {
  const line = document.createElement('p');
  line.className = `test-result-status ${result.ok ? 'success' : 'error'}`;
  line.textContent = result.ok ? `${label}: OK` : `${label}: Error - ${result.message}`;
  return line;
}

function renderTestResult(result) {
  const card = document.createElement('article');
  card.className = 'test-result-card';

  const title = document.createElement('h3');
  title.textContent = result.repository;

  card.append(
    title,
    createStatusLine('Repository data', result.metadata),
    createStatusLine('Traffic data', result.traffic),
  );
  testResults.append(card);
}

async function testRepositoryConnection(repository, token) {
  const [metadataResult, trafficResult] = await Promise.allSettled([
    fetchRepositoryMetadata(repository, token),
    fetchRepositoryTrafficViews(repository, token),
  ]);

  return {
    repository,
    metadata: metadataResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(metadataResult.reason) },
    traffic: trafficResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(trafficResult.reason) },
  };
}

async function handleConnectionTest() {
  if (isTestingConnection) {
    return;
  }

  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();

  const token = tokenInput.value.trim();
  if (!token) {
    setMessage(testMessage, 'Enter a GitHub token before testing the connection.', 'error');
    return;
  }

  const validation = validateRepositories();
  if (!validation.isValid) {
    setMessage(repoMessage, validation.message, 'error');
    return;
  }

  if (validation.repositories.length === 0) {
    setMessage(testMessage, 'Enter at least one valid repository before testing the connection.', 'error');
    return;
  }

  isTestingConnection = true;
  testConnectionButton.disabled = true;
  testConnectionButton.textContent = 'Testing…';
  setMessage(testMessage, 'Testing connection…', '');

  try {
    const results = await Promise.all(
      validation.repositories.map((repository) => testRepositoryConnection(repository, token)),
    );

    testResults.textContent = '';
    results.forEach(renderTestResult);
    const hasFailure = results.some((result) => !result.metadata.ok || !result.traffic.ok);
    setMessage(
      testMessage,
      hasFailure
        ? 'Connection test finished. Review the repository and traffic results below.'
        : 'Connection test succeeded for all repositories.',
      hasFailure ? 'error' : 'success',
    );
  } finally {
    isTestingConnection = false;
    testConnectionButton.disabled = false;
    testConnectionButton.textContent = 'Test connection';
  }
}

async function loadSettings() {
  try {
    const settings = await getSettings();
    tokenInput.value = settings.githubToken;
    renderRepositories(settings.repositories);
  } catch (error) {
    setMessage(statusMessage, 'Unable to load saved settings. Please try again.', 'error');
  }
}

addRepositoryButton.addEventListener('click', () => {
  addRepositoryRow('', true);
  setMessage(statusMessage, '', '');
  clearTestResults();
});

resetButton.addEventListener('click', loadSettings);
testConnectionButton.addEventListener('click', handleConnectionTest);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();

  const validation = validateRepositories();
  if (!validation.isValid) {
    setMessage(repoMessage, validation.message, 'error');
    return;
  }

  try {
    const savedSettings = await saveSettings({
      githubToken: tokenInput.value,
      repositories: validation.repositories,
    });
    renderRepositories(savedSettings.repositories);
    setMessage(statusMessage, 'Settings saved successfully.', 'success');
  } catch (error) {
    setMessage(statusMessage, 'Unable to save settings. Please try again.', 'error');
  }
});

loadSettings();
