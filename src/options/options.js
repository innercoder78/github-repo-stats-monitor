import { getSettings, isValidRepositoryName, normalizeRepositoryName, saveSettings } from '../shared/storage.js';

const MAX_REPOSITORIES = 20;

const form = document.getElementById('settings-form');
const tokenInput = document.getElementById('github-token');
const repositoryList = document.getElementById('repository-list');
const addRepositoryButton = document.getElementById('add-repository');
const resetButton = document.getElementById('reset-settings');
const repoMessage = document.getElementById('repo-message');
const statusMessage = document.getElementById('status-message');

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
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
  input.placeholder = 'owner/repo';
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
      message: `Invalid repository "${invalidValue}". Use owner/repo, for example innercoder78/github-repo-stats-monitor.`,
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
});

resetButton.addEventListener('click', loadSettings);

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');

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
