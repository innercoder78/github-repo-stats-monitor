export const GITHUB_ACTIVITY_KEY = 'githubActivityStatus';
export const GITHUB_ACTIVITY_STALE_MS = 30 * 60 * 1000;
export const GITHUB_ACTIVITY_QUIET_WINDOW_MS = 2 * 60 * 1000;

function getStorageArea() {
  return chrome.storage.local;
}

function createActivityToken(source) {
  return `${source || 'github'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toIsoTime(timestamp) {
  return new Date(timestamp).toISOString();
}

function getActiveUntilFromStartedAt(startedAt) {
  const startedTime = Date.parse(startedAt || '');
  return Number.isFinite(startedTime) ? toIsoTime(startedTime + GITHUB_ACTIVITY_STALE_MS) : '';
}

function normalizeOperation(operation, now) {
  const normalizedOperation = operation && typeof operation === 'object' ? operation : {};
  const startedAt = typeof normalizedOperation.startedAt === 'string' ? normalizedOperation.startedAt : '';
  const activeUntil = typeof normalizedOperation.activeUntil === 'string'
    ? normalizedOperation.activeUntil
    : getActiveUntilFromStartedAt(startedAt);
  const activeUntilTime = Date.parse(activeUntil || '');

  if (!Number.isFinite(activeUntilTime) || now >= activeUntilTime) {
    return null;
  }

  return {
    source: typeof normalizedOperation.source === 'string' ? normalizedOperation.source : '',
    startedAt,
    activeUntil,
  };
}

function getStoredActiveOperations(activity) {
  if (activity.activeOperations && typeof activity.activeOperations === 'object') {
    return activity.activeOperations;
  }

  if (typeof activity.activeToken === 'string' && activity.activeToken) {
    return {
      [activity.activeToken]: {
        source: typeof activity.activeSource === 'string' ? activity.activeSource : '',
        startedAt: typeof activity.activeStartedAt === 'string' ? activity.activeStartedAt : '',
        activeUntil: typeof activity.activeUntil === 'string' ? activity.activeUntil : '',
      },
    };
  }

  return {};
}

function normalizeActivityStatus(status, now = Date.now()) {
  const activity = status && typeof status === 'object' ? status : {};
  const activeOperations = {};

  Object.entries(getStoredActiveOperations(activity)).forEach(([token, operation]) => {
    const normalizedOperation = normalizeOperation(operation, now);
    if (normalizedOperation && token) {
      activeOperations[token] = normalizedOperation;
    }
  });

  return {
    active: Object.keys(activeOperations).length > 0,
    activeOperations,
    lastFinishedAt: typeof activity.lastFinishedAt === 'string' ? activity.lastFinishedAt : '',
    lastFinishedSource: typeof activity.lastFinishedSource === 'string' ? activity.lastFinishedSource : '',
    quietUntil: typeof activity.quietUntil === 'string' ? activity.quietUntil : '',
  };
}

export function getGitHubActivityStatus() {
  return new Promise((resolve, reject) => {
    getStorageArea().get({ [GITHUB_ACTIVITY_KEY]: {} }, (stored) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(normalizeActivityStatus(stored[GITHUB_ACTIVITY_KEY]));
    });
  });
}

function saveGitHubActivityStatus(status) {
  return new Promise((resolve, reject) => {
    getStorageArea().set({ [GITHUB_ACTIVITY_KEY]: status }, () => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(status);
    });
  });
}

export async function markGitHubActivityStarted(source = 'github') {
  const startedAt = new Date().toISOString();
  const token = createActivityToken(source);
  const existingStatus = await getGitHubActivityStatus();
  const activeUntil = toIsoTime(Date.now() + GITHUB_ACTIVITY_STALE_MS);
  const activeOperations = {
    ...existingStatus.activeOperations,
    [token]: { source, startedAt, activeUntil },
  };
  const status = await saveGitHubActivityStatus({
    ...existingStatus,
    active: true,
    activeOperations,
    quietUntil: activeUntil,
  });
  return { token, status };
}

export async function markGitHubActivityFinished(activity = {}, source = 'github') {
  const finishedAt = new Date().toISOString();
  const existingStatus = await getGitHubActivityStatus();
  const activeOperations = { ...existingStatus.activeOperations };
  delete activeOperations[activity.token];

  const status = await saveGitHubActivityStatus({
    ...existingStatus,
    active: Object.keys(activeOperations).length > 0,
    activeOperations,
    lastFinishedAt: finishedAt,
    lastFinishedSource: source,
    quietUntil: toIsoTime(Date.now() + GITHUB_ACTIVITY_QUIET_WINDOW_MS),
  });
  return status;
}

export async function runTrackedGitHubActivity(source, task) {
  const activity = await markGitHubActivityStarted(source);
  try {
    return await task();
  } finally {
    await markGitHubActivityFinished(activity, source);
  }
}
