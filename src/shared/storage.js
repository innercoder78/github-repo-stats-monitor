const DEFAULT_SETTINGS = Object.freeze({
  githubToken: '',
  repositories: [],
});

function getChromeStorage() {
  return chrome.storage.local;
}

export function normalizeRepositoryName(value) {
  return String(value || '').trim().toLowerCase();
}

export function isValidRepositoryName(value) {
  const normalizedValue = normalizeRepositoryName(value);
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalizedValue);
}

export function getSettings() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get(DEFAULT_SETTINGS, (storedSettings) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve({
        githubToken: typeof storedSettings.githubToken === 'string' ? storedSettings.githubToken : '',
        repositories: Array.isArray(storedSettings.repositories)
          ? storedSettings.repositories.map(normalizeRepositoryName).filter(isValidRepositoryName)
          : [],
      });
    });
  });
}

export function saveSettings(settings) {
  const nextSettings = {
    githubToken: typeof settings.githubToken === 'string' ? settings.githubToken : '',
    repositories: Array.isArray(settings.repositories)
      ? settings.repositories.map(normalizeRepositoryName).filter(isValidRepositoryName)
      : [],
  };

  return new Promise((resolve, reject) => {
    getChromeStorage().set(nextSettings, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextSettings);
    });
  });
}
