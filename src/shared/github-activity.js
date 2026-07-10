export const GITHUB_ACTIVITY_KEY = 'githubActivityStatus';
export const GITHUB_ACTIVITY_STALE_MS = 30 * 60 * 1000;
export const GITHUB_ACTIVITY_QUIET_WINDOW_MS = 2 * 60 * 1000;

function getStorageArea() {
  return chrome.storage.local;
}

const liveActivityOperations = new Map();

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

function normalizeOperation(operation, now, token = '') {
  const normalizedOperation = operation && typeof operation === 'object' ? operation : {};
  const startedAt = typeof normalizedOperation.startedAt === 'string' ? normalizedOperation.startedAt : '';
  const activeUntil = typeof normalizedOperation.activeUntil === 'string'
    ? normalizedOperation.activeUntil
    : getActiveUntilFromStartedAt(startedAt);
  const activeUntilTime = Date.parse(activeUntil || '');

  if ((!Number.isFinite(activeUntilTime) || now >= activeUntilTime) && !liveActivityOperations.has(token)) {
    return null;
  }

  const liveOperation = liveActivityOperations.get(token);

  return {
    source: typeof liveOperation?.source === 'string' ? liveOperation.source : typeof normalizedOperation.source === 'string' ? normalizedOperation.source : '',
    startedAt: typeof liveOperation?.startedAt === 'string' ? liveOperation.startedAt : startedAt,
    activeUntil: typeof liveOperation?.activeUntil === 'string' ? liveOperation.activeUntil : activeUntil,
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
    const normalizedOperation = normalizeOperation(operation, now, token);
    if (normalizedOperation && token) {
      activeOperations[token] = normalizedOperation;
    }
  });

  liveActivityOperations.forEach((operation, token) => {
    if (token && !activeOperations[token]) {
      activeOperations[token] = { ...operation };
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

let activityStatusUpdateQueue = Promise.resolve();

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

async function updateGitHubActivityStatus(updater) {
  const updateTask = activityStatusUpdateQueue.then(async () => {
    const existingStatus = await getGitHubActivityStatus();
    const updatedStatus = updater(existingStatus);
    return saveGitHubActivityStatus(normalizeActivityStatus(updatedStatus));
  });

  activityStatusUpdateQueue = updateTask.catch(() => {});
  return updateTask;
}

export async function markGitHubActivityStarted(source = 'github') {
  const startedAt = new Date().toISOString();
  const token = createActivityToken(source);
  const activeUntil = toIsoTime(Date.now() + GITHUB_ACTIVITY_STALE_MS);
  liveActivityOperations.set(token, { source, startedAt, activeUntil });

  let status;
  try {
    status = await updateGitHubActivityStatus((existingStatus) => {
      const activeOperations = {
        ...existingStatus.activeOperations,
        [token]: { source, startedAt, activeUntil },
      };

      return {
        ...existingStatus,
        active: true,
        activeOperations,
        quietUntil: activeUntil,
      };
    });
  } catch (error) {
    liveActivityOperations.delete(token);
    throw error;
  }

  return { token, status };
}

export async function markGitHubActivityFinished(activity = {}, source = 'github') {
  const finishedAt = new Date().toISOString();
  liveActivityOperations.delete(activity.token);
  return updateGitHubActivityStatus((existingStatus) => {
    const activeOperations = { ...existingStatus.activeOperations };
    delete activeOperations[activity.token];

    return {
      ...existingStatus,
      active: Object.keys(activeOperations).length > 0,
      activeOperations,
      lastFinishedAt: finishedAt,
      lastFinishedSource: source,
      quietUntil: toIsoTime(Date.now() + GITHUB_ACTIVITY_QUIET_WINDOW_MS),
    };
  });
}

export async function runTrackedGitHubActivity(source, task) {
  const activity = await markGitHubActivityStarted(source);
  try {
    return await task();
  } finally {
    try {
      await markGitHubActivityFinished(activity, source);
    } catch (cleanupError) {
      console.warn('Unable to clear completed GitHub activity state.', cleanupError);
    }
  }
}

export function __resetGitHubActivityLiveOperationsForTest() {
  liveActivityOperations.clear();
}

export function __getGitHubActivityLiveOperationCountForTest() {
  return liveActivityOperations.size;
}
