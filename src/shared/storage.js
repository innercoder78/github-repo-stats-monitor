const DEFAULT_NOTIFICATION_SETTINGS = Object.freeze({
  backgroundChecksEnabled: false,
  trackedStats: Object.freeze({
    stars: true,
    forks: true,
    repoWatchers: true,
    accountFollowers: true,
  }),
  systemNotificationsEnabled: false,
  badgeEnabled: false,
  checkIntervalMinutes: 30,
});

const DEFAULT_SETTINGS = Object.freeze({
  githubToken: '',
  repositories: [],
  appearance: 'light',
  notifications: DEFAULT_NOTIFICATION_SETTINGS,
});

const DEFAULT_ACCOUNT_STATS = Object.freeze({
  login: '',
  followers: 0,
  fetchedAt: '',
});

const DEFAULT_STATS = Object.freeze({
  latestStats: {},
  accountStats: DEFAULT_ACCOUNT_STATS,
});

function getChromeStorage() {
  return chrome.storage.local;
}

export function normalizeRepositoryName(value) {
  const trimmedValue = String(value || '').trim().toLowerCase();
  const githubUrlMatch = trimmedValue.match(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/?$/);

  if (githubUrlMatch) {
    return `${githubUrlMatch[1]}/${githubUrlMatch[2]}`;
  }

  return trimmedValue;
}

export function isValidRepositoryName(value) {
  const normalizedValue = normalizeRepositoryName(value);
  return /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?\/[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/.test(normalizedValue);
}

export function normalizeAppearance(value) {
  return value === 'dark' ? 'dark' : 'light';
}

const VALID_NOTIFICATION_INTERVALS = Object.freeze([5, 15, 30, 60, 120]);

function normalizeBoolean(value, fallback) {
  return typeof value === 'boolean' ? value : fallback;
}

export function normalizeNotificationSettings(settings) {
  const notifications = settings && typeof settings === 'object' ? settings : {};
  const trackedStats = notifications.trackedStats && typeof notifications.trackedStats === 'object'
    ? notifications.trackedStats
    : {};
  const interval = Number(notifications.checkIntervalMinutes);

  return {
    backgroundChecksEnabled: normalizeBoolean(notifications.backgroundChecksEnabled, false),
    trackedStats: {
      stars: normalizeBoolean(trackedStats.stars, true),
      forks: normalizeBoolean(trackedStats.forks, true),
      repoWatchers: normalizeBoolean(trackedStats.repoWatchers, true),
      accountFollowers: normalizeBoolean(trackedStats.accountFollowers, true),
    },
    systemNotificationsEnabled: normalizeBoolean(notifications.systemNotificationsEnabled, false),
    badgeEnabled: normalizeBoolean(notifications.badgeEnabled, false),
    checkIntervalMinutes: VALID_NOTIFICATION_INTERVALS.includes(interval) ? interval : 30,
  };
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
        appearance: normalizeAppearance(storedSettings.appearance),
        notifications: normalizeNotificationSettings(storedSettings.notifications),
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
    appearance: normalizeAppearance(settings.appearance),
    notifications: normalizeNotificationSettings(settings.notifications),
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

function normalizeNonNegativeNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) && numberValue >= 0 ? numberValue : 0;
}

export function normalizeAccountStats(stats) {
  return {
    login: typeof stats?.login === 'string' ? stats.login : '',
    followers: normalizeNonNegativeNumber(stats?.followers),
    fetchedAt: typeof stats?.fetchedAt === 'string' ? stats.fetchedAt : '',
  };
}

function normalizeStatsEntry(repository, stats) {
  const normalizedRepository = normalizeRepositoryName(repository || stats?.repository);

  if (!isValidRepositoryName(normalizedRepository)) {
    return null;
  }

  const dailyViews = Array.isArray(stats?.dailyViews)
    ? stats.dailyViews.map((entry) => ({
      date: typeof entry?.date === 'string' ? entry.date : '',
      views: Number(entry?.views) || 0,
      uniqueVisitors: Number(entry?.uniqueVisitors) || 0,
    })).filter((entry) => entry.date)
    : [];

  const dailyClones = Array.isArray(stats?.dailyClones)
    ? stats.dailyClones.map((entry) => ({
      date: typeof entry?.date === 'string' ? entry.date : '',
      clones: Number(entry?.clones) || 0,
      uniqueCloners: Number(entry?.uniqueCloners) || 0,
    })).filter((entry) => entry.date)
    : [];

  const referrers = Array.isArray(stats?.referrers)
    ? stats.referrers.map((entry) => ({
      referrer: String(entry?.referrer || '').trim(),
      count: Number(entry?.count) || 0,
      uniques: Number(entry?.uniques) || 0,
    })).filter((entry) => entry.referrer)
    : [];

  return {
    repository: normalizedRepository,
    stars: normalizeNonNegativeNumber(stats?.stars),
    forks: normalizeNonNegativeNumber(stats?.forks),
    subscribers: normalizeNonNegativeNumber(stats?.subscribers),
    views: Number.isFinite(Number(stats?.views)) ? Number(stats.views) : null,
    uniqueVisitors: Number.isFinite(Number(stats?.uniqueVisitors)) ? Number(stats.uniqueVisitors) : null,
    dailyViews,
    clones: Number.isFinite(Number(stats?.clones)) ? Number(stats.clones) : null,
    dailyClones,
    fetchedAt: typeof stats?.fetchedAt === 'string' ? stats.fetchedAt : '',
    trafficFetchedAt: typeof stats?.trafficFetchedAt === 'string' ? stats.trafficFetchedAt : '',
    clonesFetchedAt: typeof stats?.clonesFetchedAt === 'string' ? stats.clonesFetchedAt : '',
    referrers,
    referrersFetchedAt: typeof stats?.referrersFetchedAt === 'string' ? stats.referrersFetchedAt : '',
    error: typeof stats?.error === 'string' ? stats.error : '',
    trafficError: typeof stats?.trafficError === 'string' ? stats.trafficError : '',
    clonesError: typeof stats?.clonesError === 'string' ? stats.clonesError : '',
    referrersError: typeof stats?.referrersError === 'string' ? stats.referrersError : '',
  };
}

export function getAccountStats() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get(DEFAULT_STATS, (storedStats) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(normalizeAccountStats(storedStats.accountStats));
    });
  });
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

export function resetExtensionData() {
  return new Promise((resolve, reject) => {
    getChromeStorage().clear(() => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve({
        settings: { ...DEFAULT_SETTINGS },
        latestStats: { ...DEFAULT_STATS.latestStats },
        accountStats: { ...DEFAULT_STATS.accountStats },
      });
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

export function saveAccountStats(accountStats) {
  const nextAccountStats = normalizeAccountStats(accountStats);

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ accountStats: nextAccountStats }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextAccountStats);
    });
  });
}
