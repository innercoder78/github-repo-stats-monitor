import { fetchAuthenticatedRepositories, fetchRepositoryMetadata, fetchRepositoryTrafficClones, fetchRepositoryTrafficReferrers, fetchRepositoryTrafficViews } from '../shared/github-api.js';
import { getSettings, isValidRepositoryName, normalizeRepositoryName, resetExtensionData, saveSettings } from '../shared/storage.js';
import { getRepositoryUrl } from '../shared/repository-url.js';
import { openQuickSummary } from '../shared/quick-summary.js';
import { applyAppearance, applySavedAppearance } from '../shared/appearance.js';

const MAX_REPOSITORIES = 20;

const form = document.getElementById('settings-form');
const tokenInput = document.getElementById('github-token');
const appearanceInputs = Array.from(document.querySelectorAll('input[name="appearance"]'));
const repositoryList = document.getElementById('repository-list');
const addRepositoryButton = document.getElementById('add-repository');
const importRepositoriesButton = document.getElementById('import-repositories');
const resetButton = document.getElementById('reset-settings');
const openDashboardButton = document.getElementById('open-dashboard');
const openQuickSummaryButton = document.getElementById('open-quick-summary');
const testConnectionButton = document.getElementById('test-connection');
const repoMessage = document.getElementById('repo-message');
const statusMessage = document.getElementById('status-message');
const testMessage = document.getElementById('test-message');
const importPanel = document.getElementById('import-panel');
const importMessage = document.getElementById('import-message');
const testResults = document.getElementById('test-results');
const importResults = document.getElementById('import-results');
const addImportedRepositoriesButton = document.getElementById('add-imported-repositories');
const quickSummaryMessage = document.getElementById('quick-summary-message');
const resetConfirmationDialog = document.getElementById('reset-confirmation-dialog');
const confirmResetButton = document.getElementById('confirm-reset');
const cancelResetButton = document.getElementById('cancel-reset');

let isTestingConnection = false;
let isImportingRepositories = false;
let importedRepositories = [];

applySavedAppearance();

function setMessage(element, text, type = '') {
  element.textContent = text;
  element.className = `message ${type}`.trim();
}

function clearTestResults() {
  setMessage(testMessage, '', '');
  testResults.textContent = '';
}

function clearImportResults() {
  setMessage(importMessage, '', '');
  importResults.textContent = '';
  importedRepositories = [];
  addImportedRepositoriesButton.disabled = true;
  importPanel.hidden = true;
}

function showImportPanel() {
  importPanel.hidden = false;
}

function getRepositoryInputs() {
  return Array.from(repositoryList.querySelectorAll('.repository-input'));
}

function getNormalizedCurrentRepositories() {
  return getRepositoryInputs()
    .map((input) => normalizeRepositoryName(input.value))
    .filter((value) => value && isValidRepositoryName(value));
}

function getCurrentRepositorySet() {
  return new Set(getNormalizedCurrentRepositories());
}

function getRemainingRepositorySlots() {
  return Math.max(0, MAX_REPOSITORIES - getNormalizedCurrentRepositories().length);
}

function updateRepositoryControls() {
  const rows = Array.from(repositoryList.querySelectorAll('.repository-row'));

  rows.forEach((row, index) => {
    const moveUpButton = row.querySelector('.move-repository-up');
    const moveDownButton = row.querySelector('.move-repository-down');

    moveUpButton.disabled = index === 0;
    moveDownButton.disabled = index === rows.length - 1;
  });

  addRepositoryButton.disabled = rows.length >= MAX_REPOSITORIES;
  addRepositoryButton.title = rows.length >= MAX_REPOSITORIES ? 'Maximum of 20 repositories reached.' : '';
}

function updateAddButtonState() {
  updateRepositoryControls();
}

function focusMovedRow(row, fallbackButton) {
  if (fallbackButton && !fallbackButton.disabled) {
    fallbackButton.focus();
    return;
  }

  row.querySelector('.repository-input').focus();
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
  input.addEventListener('input', updateImportSelectionState);

  const controls = document.createElement('div');
  controls.className = 'repository-controls';

  const moveUpButton = document.createElement('button');
  moveUpButton.className = 'secondary move-repository-up';
  moveUpButton.type = 'button';
  moveUpButton.textContent = 'Move Up';
  moveUpButton.addEventListener('click', () => {
    const previousRow = row.previousElementSibling;

    if (!previousRow) {
      return;
    }

    repositoryList.insertBefore(row, previousRow);
    setMessage(repoMessage, '', '');
    setMessage(statusMessage, '', '');
    clearTestResults();
    updateRepositoryControls();
    updateImportSelectionState();
    focusMovedRow(row, moveUpButton);
  });

  const moveDownButton = document.createElement('button');
  moveDownButton.className = 'secondary move-repository-down';
  moveDownButton.type = 'button';
  moveDownButton.textContent = 'Move Down';
  moveDownButton.addEventListener('click', () => {
    const nextRow = row.nextElementSibling;

    if (!nextRow) {
      return;
    }

    repositoryList.insertBefore(nextRow, row);
    setMessage(repoMessage, '', '');
    setMessage(statusMessage, '', '');
    clearTestResults();
    updateRepositoryControls();
    updateImportSelectionState();
    focusMovedRow(row, moveDownButton);
  });

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
    updateRepositoryControls();
    updateImportSelectionState();
  });

  controls.append(moveUpButton, moveDownButton, removeButton);
  label.append(input);
  row.append(label, controls);
  repositoryList.append(row);
  updateRepositoryControls();

  if (shouldFocus) {
    input.focus();
  }

  return row;
}

function addRepositoryRow(value = '', shouldFocus = false) {
  const normalizedValue = normalizeRepositoryName(value);
  const hasRepositoryValue = normalizedValue && isValidRepositoryName(normalizedValue);
  const hasReachedLimit = hasRepositoryValue
    ? getNormalizedCurrentRepositories().length >= MAX_REPOSITORIES
    : getRepositoryInputs().length >= MAX_REPOSITORIES;

  if (hasReachedLimit) {
    setMessage(repoMessage, 'You can configure up to 20 repositories.', 'error');
    updateAddButtonState();
    return null;
  }

  return createRepositoryRow(value, shouldFocus);
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


function getVisibleRepositoryNames() {
  return getCurrentRepositorySet();
}

function getSelectedImportedRepositories() {
  return Array.from(importResults.querySelectorAll('.import-repository-checkbox:checked'))
    .map((checkbox) => checkbox.dataset.repository)
    .filter(Boolean);
}

function updateImportSelectionState(shouldShowLimitMessage = true) {
  const monitoredRepositories = getVisibleRepositoryNames();
  const remainingSlots = getRemainingRepositorySlots();
  let selectedCount = getSelectedImportedRepositories().length;

  importResults.querySelectorAll('.import-repository-card').forEach((card) => {
    const checkbox = card.querySelector('.import-repository-checkbox');
    const repositoryName = checkbox?.dataset.repository;
    if (!checkbox || !repositoryName) {
      return;
    }

    const isAlreadyMonitored = monitoredRepositories.has(repositoryName);
    if (isAlreadyMonitored && checkbox.checked) {
      checkbox.checked = false;
      selectedCount = getSelectedImportedRepositories().length;
    }

    const limitBlocksSelection = remainingSlots === 0 || (!checkbox.checked && selectedCount >= remainingSlots);
    checkbox.disabled = isAlreadyMonitored || limitBlocksSelection;
    card.classList.toggle('is-disabled', checkbox.disabled);

    const status = card.querySelector('.import-repository-selection-status');
    if (status) {
      if (isAlreadyMonitored) {
        status.textContent = 'Already monitored';
      } else if (remainingSlots === 0) {
        status.textContent = 'Repository limit reached';
      } else if (!checkbox.checked && selectedCount >= remainingSlots) {
        status.textContent = 'Repository limit reached for this selection';
      } else {
        status.textContent = 'Available to add';
      }
    }
  });

  if (shouldShowLimitMessage && remainingSlots === 0) {
    setMessage(importMessage, 'You can configure up to 20 repositories. Remove a repository before adding more.', 'error');
  }

  const updatedSelectedCount = getSelectedImportedRepositories().length;
  addImportedRepositoriesButton.disabled = updatedSelectedCount === 0 || updatedSelectedCount > remainingSlots;
}

function createImportAttribute(label, value) {
  const item = document.createElement('span');
  item.className = 'import-repository-attribute';
  item.textContent = `${label}: ${value}`;
  return item;
}

function renderImportedRepository(repository, monitoredRepositories) {
  const normalizedName = normalizeRepositoryName(repository.fullName);
  const card = document.createElement('article');
  card.className = 'import-repository-card';

  const label = document.createElement('label');
  label.className = 'import-repository-option';

  const checkbox = document.createElement('input');
  checkbox.className = 'import-repository-checkbox';
  checkbox.type = 'checkbox';
  checkbox.dataset.repository = normalizedName;
  checkbox.addEventListener('change', () => {
    const selectedCount = getSelectedImportedRepositories().length;
    const remainingSlots = getRemainingRepositorySlots();

    if (selectedCount > remainingSlots) {
      checkbox.checked = false;
      setMessage(importMessage, 'You can configure up to 20 repositories. Remove a repository before adding more.', 'error');
    } else {
      setMessage(importMessage, `${importedRepositories.length} repositories returned. Select repositories to add to Settings.`, 'success');
    }

    updateImportSelectionState();
  });

  const details = document.createElement('span');
  details.className = 'import-repository-details';

  const title = document.createElement('span');
  title.className = 'import-repository-name';
  if (repository.htmlUrl) {
    const link = document.createElement('a');
    link.href = repository.htmlUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = normalizedName;
    title.append(link);
  } else {
    title.textContent = normalizedName;
  }

  const attributes = document.createElement('span');
  attributes.className = 'import-repository-attributes';
  attributes.append(
    createImportAttribute('Visibility', repository.visibility || (repository.private ? 'private' : 'public')),
    createImportAttribute('Archived', repository.archived ? 'Yes' : 'No'),
    createImportAttribute('Fork', repository.fork ? 'Yes' : 'No'),
  );

  const selectionStatus = document.createElement('span');
  selectionStatus.className = 'import-repository-selection-status import-repository-badge';
  selectionStatus.textContent = monitoredRepositories.has(normalizedName) ? 'Already monitored' : 'Available to add';

  details.append(title, attributes, selectionStatus);
  label.append(checkbox, details);
  card.append(label);
  return card;
}

function renderImportedRepositories(repositories) {
  importResults.textContent = '';
  const monitoredRepositories = getVisibleRepositoryNames();
  repositories.forEach((repository) => {
    importResults.append(renderImportedRepository(repository, monitoredRepositories));
  });
  updateImportSelectionState();
}

function removeOnlyEmptyRepositoryRowBeforeImport() {
  const inputs = getRepositoryInputs();
  if (inputs.length !== 1 || normalizeRepositoryName(inputs[0].value)) {
    return;
  }

  inputs[0].closest('.repository-row')?.remove();
}

function handleAddImportedRepositories() {
  const selectedNames = getSelectedImportedRepositories();
  if (selectedNames.length === 0) {
    return;
  }

  const currentRepositories = getCurrentRepositorySet();
  const remainingSlots = getRemainingRepositorySlots();
  if (remainingSlots === 0 || selectedNames.length > remainingSlots) {
    setMessage(importMessage, 'You can configure up to 20 repositories. Remove a repository before adding more.', 'error');
    updateImportSelectionState();
    return;
  }

  removeOnlyEmptyRepositoryRowBeforeImport();

  let addedCount = 0;
  selectedNames.forEach((repositoryName) => {
    if (addedCount >= remainingSlots || currentRepositories.has(repositoryName)) {
      return;
    }

    const addedRow = addRepositoryRow(repositoryName);
    if (!addedRow) {
      return;
    }

    currentRepositories.add(repositoryName);
    addedCount += 1;
  });

  importResults.querySelectorAll('.import-repository-checkbox:checked').forEach((checkbox) => {
    checkbox.checked = false;
  });

  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();
  setMessage(importMessage, `Added ${addedCount} ${addedCount === 1 ? 'repository' : 'repositories'}. Review the list, then click Save Settings.`, 'success');
  updateRepositoryControls();
  updateImportSelectionState(false);
}

async function handleRepositoryImport() {
  if (isImportingRepositories) {
    return;
  }

  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();
  showImportPanel();
  importResults.textContent = '';
  importedRepositories = [];
  addImportedRepositoriesButton.disabled = true;

  const token = tokenInput.value.trim();
  if (!token) {
    setMessage(importMessage, 'Save or enter a GitHub token first so the extension can list repositories that token can access.', 'error');
    return;
  }

  isImportingRepositories = true;
  importRepositoriesButton.disabled = true;
  importRepositoriesButton.textContent = 'Loading…';
  setMessage(importMessage, 'Loading repositories from GitHub…', '');

  try {
    const repositories = await fetchAuthenticatedRepositories(token);
    if (repositories.length === 0) {
      setMessage(importMessage, 'No repositories were returned for this token.', '');
      return;
    }

    importedRepositories = repositories;
    renderImportedRepositories(importedRepositories);
    setMessage(importMessage, `${repositories.length} repositories returned. Select repositories to add to Settings.`, 'success');
    updateImportSelectionState();
  } catch (error) {
    setMessage(importMessage, getSafeErrorMessage(error), 'error');
  } finally {
    isImportingRepositories = false;
    importRepositoriesButton.disabled = false;
    importRepositoriesButton.textContent = 'Import from GitHub';
  }
}

function getSafeErrorMessage(error) {
  const message = error instanceof Error ? error.message : 'Unable to complete this GitHub request.';
  return message || 'Unable to complete this GitHub request.';
}

function createRepositoryNameElement(repository) {
  const title = document.createElement('h3');
  const repositoryUrl = getRepositoryUrl(repository);

  if (!repositoryUrl) {
    title.textContent = repository || 'Repository';
    return title;
  }

  const link = document.createElement('a');
  link.className = 'test-result-repo-link';
  link.href = repositoryUrl;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = repository;
  title.append(link);
  return title;
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

  card.append(
    createRepositoryNameElement(result.repository),
    createStatusLine('Repository data', result.metadata),
    createStatusLine('Traffic views', result.traffic),
    createStatusLine('Traffic clones', result.clones),
    createStatusLine('Referrers data', result.referrers),
  );
  testResults.append(card);
}

async function testRepositoryConnection(repository, token) {
  const [metadataResult, trafficResult, clonesResult, referrersResult] = await Promise.allSettled([
    fetchRepositoryMetadata(repository, token),
    fetchRepositoryTrafficViews(repository, token),
    fetchRepositoryTrafficClones(repository, token),
    fetchRepositoryTrafficReferrers(repository, token),
  ]);

  return {
    repository,
    metadata: metadataResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(metadataResult.reason) },
    traffic: trafficResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(trafficResult.reason) },
    clones: clonesResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(clonesResult.reason) },
    referrers: referrersResult.status === 'fulfilled'
      ? { ok: true }
      : { ok: false, message: getSafeErrorMessage(referrersResult.reason) },
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
    const hasFailure = results.some((result) => !result.metadata.ok || !result.traffic.ok || !result.clones.ok || !result.referrers.ok);
    setMessage(
      testMessage,
      hasFailure
        ? 'Connection test finished. Review the repository, traffic views, clones, and referrers results below.'
        : 'Connection test succeeded for all repositories.',
      hasFailure ? 'error' : 'success',
    );
  } finally {
    isTestingConnection = false;
    testConnectionButton.disabled = false;
    testConnectionButton.textContent = 'Test connection';
  }
}

function renderSettings(settings) {
  tokenInput.value = settings.githubToken;
  appearanceInputs.forEach((input) => {
    input.checked = input.value === settings.appearance;
  });
  applyAppearance(settings.appearance);
  renderRepositories(settings.repositories);
}

async function loadSettings() {
  try {
    const settings = await getSettings();
    renderSettings(settings);
  } catch (error) {
    setMessage(statusMessage, 'Unable to load saved settings. Please try again.', 'error');
  }
}

async function resetSettings() {
  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();
  clearImportResults();

  try {
    const resetData = await resetExtensionData();
    renderSettings(resetData.settings);
    setMessage(statusMessage, 'Settings reset.', 'success');
  } catch (error) {
    setMessage(statusMessage, 'Unable to reset settings. Please try again.', 'error');
  }
}

function openResetConfirmation() {
  resetConfirmationDialog.showModal();
  confirmResetButton.focus();
}

function closeResetConfirmation(shouldReturnFocus = true) {
  resetConfirmationDialog.close();

  if (shouldReturnFocus) {
    resetButton.focus();
  }
}

importRepositoriesButton.addEventListener('click', handleRepositoryImport);
addImportedRepositoriesButton.addEventListener('click', handleAddImportedRepositories);

addRepositoryButton.addEventListener('click', () => {
  addRepositoryRow('', true);
  setMessage(statusMessage, '', '');
  clearTestResults();
  updateImportSelectionState();
});

resetButton.addEventListener('click', openResetConfirmation);
confirmResetButton.addEventListener('click', () => {
  closeResetConfirmation(false);
  resetSettings();
});
cancelResetButton.addEventListener('click', () => closeResetConfirmation());
resetConfirmationDialog.addEventListener('click', (event) => {
  if (event.target === resetConfirmationDialog) {
    closeResetConfirmation();
  }
});
resetConfirmationDialog.addEventListener('cancel', () => {
  resetButton.focus();
});
openDashboardButton.addEventListener('click', () => {
  window.location.href = chrome.runtime.getURL('src/dashboard/dashboard.html');
});
testConnectionButton.addEventListener('click', handleConnectionTest);
openQuickSummaryButton.addEventListener('click', () => openQuickSummary(quickSummaryMessage));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  setMessage(repoMessage, '', '');
  setMessage(statusMessage, '', '');
  clearTestResults();
  clearImportResults();

  const validation = validateRepositories();
  if (!validation.isValid) {
    setMessage(repoMessage, validation.message, 'error');
    return;
  }

  try {
    const selectedAppearance = appearanceInputs.find((input) => input.checked)?.value || 'light';
    const savedSettings = await saveSettings({
      githubToken: tokenInput.value,
      repositories: validation.repositories,
      appearance: selectedAppearance,
    });
    applyAppearance(savedSettings.appearance);
    renderRepositories(savedSettings.repositories);
    setMessage(statusMessage, 'Settings saved successfully.', 'success');
  } catch (error) {
    setMessage(statusMessage, 'Unable to save settings. Please try again.', 'error');
  }
});

loadSettings();
