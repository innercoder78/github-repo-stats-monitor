import { getDefaultDisplayPreferences, normalizeDisplayPreferences } from './display-format.js';

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
  displayPreferences: getDefaultDisplayPreferences(),
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
const DEFAULT_PENDING_ACTIVITY = Object.freeze({
  account: Object.freeze({}),
  repositories: Object.freeze({}),
  badgeActivity: Object.freeze({
    account: false,
    repositories: Object.freeze({}),
    updatedAt: '',
  }),
  updatedAt: '',
});

const DEFAULT_NOTIFICATION_BASELINES = Object.freeze({
  account: Object.freeze({}),
  repositories: Object.freeze({}),
  initialized: false,
  updatedAt: '',
});
const DEFAULT_VIEWED_BASELINES = Object.freeze({
  account: Object.freeze({}),
  repositories: Object.freeze({}),
  updatedAt: '',
});
const DEFAULT_QUICK_SUMMARY_STATUS = Object.freeze({
  manualRefreshAt: '',
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
        displayPreferences: normalizeDisplayPreferences(storedSettings.displayPreferences),
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
    displayPreferences: normalizeDisplayPreferences(settings.displayPreferences),
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

function normalizeOptionalNumber(value) {
  const numberValue = Number(value);
  return Number.isFinite(numberValue) ? numberValue : undefined;
}

function normalizePendingAccountActivity(activity) {
  const followersDelta = normalizeOptionalNumber(activity?.followersDelta);

  if (!followersDelta) {
    return {};
  }

  return {
    followersDelta,
    quickSummaryShown: Boolean(activity?.quickSummaryShown),
    dashboardShown: Boolean(activity?.dashboardShown),
  };
}

function normalizePendingRepositoryActivity(repository, activity) {
  const normalizedRepository = normalizeRepositoryName(repository || activity?.repository);

  if (!isValidRepositoryName(normalizedRepository)) {
    return null;
  }

  const normalizedActivity = {
    repository: normalizedRepository,
    quickSummaryShown: Boolean(activity?.quickSummaryShown),
    dashboardShown: Boolean(activity?.dashboardShown),
  };

  ['starsDelta', 'forksDelta', 'repoWatchersDelta'].forEach((key) => {
    const delta = normalizeOptionalNumber(activity?.[key]);

    if (delta) {
      normalizedActivity[key] = delta;
    }
  });

  const hasDelta = ['starsDelta', 'forksDelta', 'repoWatchersDelta'].some((key) => Number(normalizedActivity[key]) !== 0);
  return hasDelta ? normalizedActivity : null;
}

function normalizePendingBadgeActivity(activity) {
  const badgeActivity = activity && typeof activity === 'object' ? activity : {};
  const repositories = {};
  const storedRepositories = badgeActivity.repositories && typeof badgeActivity.repositories === 'object'
    ? badgeActivity.repositories
    : {};

  Object.keys(storedRepositories).forEach((repository) => {
    const normalizedRepository = normalizeRepositoryName(repository);

    if (isValidRepositoryName(normalizedRepository) && storedRepositories[repository]) {
      repositories[normalizedRepository] = true;
    }
  });

  return {
    account: Boolean(badgeActivity.account),
    repositories,
    updatedAt: typeof badgeActivity.updatedAt === 'string' ? badgeActivity.updatedAt : '',
  };
}

export function normalizePendingActivity(activity) {
  const pendingActivity = activity && typeof activity === 'object' ? activity : {};
  const repositories = {};
  const storedRepositories = pendingActivity.repositories && typeof pendingActivity.repositories === 'object'
    ? pendingActivity.repositories
    : {};

  Object.entries(storedRepositories).forEach(([repository, repositoryActivity]) => {
    const normalizedActivity = normalizePendingRepositoryActivity(repository, repositoryActivity);

    if (normalizedActivity) {
      repositories[normalizedActivity.repository] = normalizedActivity;
    }
  });

  return {
    account: normalizePendingAccountActivity(pendingActivity.account),
    repositories,
    badgeActivity: normalizePendingBadgeActivity(pendingActivity.badgeActivity),
    updatedAt: typeof pendingActivity.updatedAt === 'string' ? pendingActivity.updatedAt : '',
  };
}

function normalizeBaselineRepository(repository, baseline) {
  const normalizedRepository = normalizeRepositoryName(repository || baseline?.repository);

  if (!isValidRepositoryName(normalizedRepository)) {
    return null;
  }

  const normalizedBaseline = {
    repository: normalizedRepository,
    updatedAt: typeof baseline?.updatedAt === 'string' ? baseline.updatedAt : '',
  };

  ['stars', 'forks', 'repoWatchers'].forEach((key) => {
    const count = normalizeOptionalNumber(baseline?.[key]);

    if (count !== undefined && count >= 0) {
      normalizedBaseline[key] = count;
    }
  });

  return normalizedBaseline;
}

function normalizeViewedBaselineRepository(repository, baseline) {
  return normalizeBaselineRepository(repository, baseline);
}

export function normalizeViewedBaselines(baselines) {
  const viewedBaselines = baselines && typeof baselines === 'object' ? baselines : {};
  const account = {};
  const followers = normalizeOptionalNumber(viewedBaselines.account?.followers);
  const repositories = {};
  const storedRepositories = viewedBaselines.repositories && typeof viewedBaselines.repositories === 'object'
    ? viewedBaselines.repositories
    : {};

  if (followers !== undefined && followers >= 0) {
    account.followers = followers;
  }

  if (typeof viewedBaselines.account?.updatedAt === 'string') {
    account.updatedAt = viewedBaselines.account.updatedAt;
  }

  Object.entries(storedRepositories).forEach(([repository, baseline]) => {
    const normalizedBaseline = normalizeViewedBaselineRepository(repository, baseline);

    if (normalizedBaseline) {
      repositories[normalizedBaseline.repository] = normalizedBaseline;
    }
  });

  return {
    account,
    repositories,
    updatedAt: typeof viewedBaselines.updatedAt === 'string' ? viewedBaselines.updatedAt : '',
  };
}

export function normalizeNotificationBaselines(baselines) {
  const notificationBaselines = baselines && typeof baselines === 'object' ? baselines : {};
  const account = {};
  const followers = normalizeOptionalNumber(notificationBaselines.account?.followers);
  const repositories = {};
  const storedRepositories = notificationBaselines.repositories && typeof notificationBaselines.repositories === 'object'
    ? notificationBaselines.repositories
    : {};

  if (followers !== undefined && followers >= 0) {
    account.followers = followers;
  }

  if (typeof notificationBaselines.account?.login === 'string') {
    account.login = notificationBaselines.account.login;
  }

  if (typeof notificationBaselines.account?.updatedAt === 'string') {
    account.updatedAt = notificationBaselines.account.updatedAt;
  }

  Object.entries(storedRepositories).forEach(([repository, baseline]) => {
    const normalizedBaseline = normalizeBaselineRepository(repository, baseline);

    if (normalizedBaseline) {
      repositories[normalizedBaseline.repository] = normalizedBaseline;
    }
  });

  return {
    account,
    repositories,
    initialized: Boolean(notificationBaselines.initialized),
    updatedAt: typeof notificationBaselines.updatedAt === 'string' ? notificationBaselines.updatedAt : '',
  };
}

export function getPendingActivity() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get({ pendingActivity: DEFAULT_PENDING_ACTIVITY }, (storedData) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(normalizePendingActivity(storedData.pendingActivity));
    });
  });
}

export function savePendingActivity(pendingActivity) {
  const nextPendingActivity = normalizePendingActivity(pendingActivity);

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ pendingActivity: nextPendingActivity }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextPendingActivity);
    });
  });
}

export function getViewedBaselines() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get({ viewedBaselines: DEFAULT_VIEWED_BASELINES }, (storedData) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(normalizeViewedBaselines(storedData.viewedBaselines));
    });
  });
}

export function saveViewedBaselines(viewedBaselines) {
  const nextViewedBaselines = normalizeViewedBaselines(viewedBaselines);

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ viewedBaselines: nextViewedBaselines }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextViewedBaselines);
    });
  });
}

export function getNotificationBaselines() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get({ notificationBaselines: DEFAULT_NOTIFICATION_BASELINES }, (storedData) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(normalizeNotificationBaselines(storedData.notificationBaselines));
    });
  });
}

export function saveNotificationBaselines(notificationBaselines) {
  const nextNotificationBaselines = normalizeNotificationBaselines(notificationBaselines);

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ notificationBaselines: nextNotificationBaselines }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextNotificationBaselines);
    });
  });
}

function normalizeQuickSummaryStatus(status) {
  return {
    manualRefreshAt: typeof status?.manualRefreshAt === 'string' ? status.manualRefreshAt : '',
  };
}

export function getQuickSummaryStatus() {
  return new Promise((resolve, reject) => {
    getChromeStorage().get({ quickSummaryStatus: DEFAULT_QUICK_SUMMARY_STATUS }, (storedData) => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(normalizeQuickSummaryStatus(storedData.quickSummaryStatus));
    });
  });
}

export function saveQuickSummaryStatus(status) {
  const nextQuickSummaryStatus = normalizeQuickSummaryStatus(status);

  return new Promise((resolve, reject) => {
    getChromeStorage().set({ quickSummaryStatus: nextQuickSummaryStatus }, () => {
      const error = chrome.runtime.lastError;

      if (error) {
        reject(error);
        return;
      }

      resolve(nextQuickSummaryStatus);
    });
  });
}
