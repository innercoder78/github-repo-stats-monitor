const DEFAULT_SETTINGS = Object.freeze({
  githubToken: '',
  repositories: [],
});

const DEFAULT_STATS = Object.freeze({
  latestStats: {},
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

function normalizeStatsEntry(repository, stats) {
  const normalizedRepository = normalizeRepositoryName(repository || stats?.repository);

  if (!isValidRepositoryName(normalizedRepository)) {
    return null;
  }

  return {
    repository: normalizedRepository,
    stars: Number(stats?.stars) || 0,
    forks: Number(stats?.forks) || 0,
    subscribers: Number(stats?.subscribers) || 0,
    fetchedAt: typeof stats?.fetchedAt === 'string' ? stats.fetchedAt : '',
    error: typeof stats?.error === 'string' ? stats.error : '',
  };
}

export function getLatestStats() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get(DEFAULT_STATS, (storedStats) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      const latestStats = {};
      const storedLatestStats = storedStats.latestStats && typeof storedStats.latestStats === 'object'
        ? storedStats.latestStats
        : {};

      Object.entries(storedLatestStats).forEach(([repository, stats]) => {
        const normalizedEntry = normalizeStatsEntry(repository, stats);

        if (normalizedEntry) {
          latestStats[normalizedEntry.repository] = normalizedEntry;
        }
      });

      resolve(latestStats);
    });
  });
}

export function saveLatestStats(latestStats) {
  const nextLatestStats = {};
  const statsToSave = latestStats && typeof latestStats === 'object' ? latestStats : {};

  Object.entries(statsToSave).forEach(([repository, stats]) => {
    const normalizedEntry = normalizeStatsEntry(repository, stats);

    if (normalizedEntry) {
      nextLatestStats[normalizedEntry.repository] = normalizedEntry;
    }
  });

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ latestStats: nextLatestStats }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextLatestStats);
    });
  });
}
