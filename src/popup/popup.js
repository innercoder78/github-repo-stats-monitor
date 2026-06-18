import { getSettings } from '../shared/storage.js';

const repositoryCount = document.getElementById('repository-count');
const tokenStatus = document.getElementById('token-status');

document.getElementById('open-dashboard').addEventListener('click', () => {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
});

document.getElementById('open-settings').addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
});

async function renderSettingsSummary() {
  try {
    const settings = await getSettings();
    repositoryCount.textContent = `Repositories configured: ${settings.repositories.length}`;
    tokenStatus.textContent = `Token saved: ${settings.githubToken ? 'Yes' : 'No'}`;
  } catch (error) {
    repositoryCount.textContent = 'Repositories configured: unavailable';
    tokenStatus.textContent = 'Token saved: unavailable';
  }
}

renderSettingsSummary();
