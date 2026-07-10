export const GITHUB_ACTIVITY_KEY = 'githubActivityStatus';
export const GITHUB_ACTIVITY_STALE_MS = 30 * 60 * 1000;
export const GITHUB_ACTIVITY_QUIET_WINDOW_MS = 2 * 60 * 1000;

function getQuietUntilTime(activity) {
  const quietUntilTime = Date.parse(activity?.quietUntil || '');
  return Number.isFinite(quietUntilTime) ? quietUntilTime : 0;
}

function maxIsoTime(...timestamps) {
  const latest = Math.max(0, ...timestamps.filter((timestamp) => Number.isFinite(timestamp)));
  return latest > 0 ? toIsoTime(latest) : '';
}

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

function normalizeActivityStatus(status, now = Date.now(), { overlayLiveOperations = true } = {}) {
  const activity = status && typeof status === 'object' ? status : {};
  const activeOperations = {};

  Object.entries(getStoredActiveOperations(activity)).forEach(([token, operation]) => {
    const normalizedOperation = normalizeOperation(operation, now, token);
    if (normalizedOperation && token) {
      activeOperations[token] = normalizedOperation;
    }
  });

  if (overlayLiveOperations) {
    liveActivityOperations.forEach((operation, token) => {
      if (token && !activeOperations[token]) {
        activeOperations[token] = { ...operation };
      }
    });
  }

  return {
    active: Object.keys(activeOperations).length > 0,
    activeOperations,
    lastFinishedAt: typeof activity.lastFinishedAt === 'string' ? activity.lastFinishedAt : '',
    lastFinishedSource: typeof activity.lastFinishedSource === 'string' ? activity.lastFinishedSource : '',
    quietUntil: typeof activity.quietUntil === 'string' ? activity.quietUntil : '',
    quietWindowSource: typeof activity.quietWindowSource === 'string' ? activity.quietWindowSource : '',
  };
}

function getPersistedGitHubActivityStatus() {
  return new Promise((resolve, reject) => {
    getStorageArea().get({ [GITHUB_ACTIVITY_KEY]: {} }, (stored) => {
      const error = chrome.runtime.lastError;
      if (error) {
        reject(error);
        return;
      }
      resolve(normalizeActivityStatus(stored[GITHUB_ACTIVITY_KEY], Date.now(), { overlayLiveOperations: false }));
    });
  });
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
    const existingStatus = await getPersistedGitHubActivityStatus();
    const updatedStatus = updater(existingStatus);
    return saveGitHubActivityStatus(normalizeActivityStatus(updatedStatus, Date.now(), { overlayLiveOperations: false }));
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
        quietUntil: maxIsoTime(getQuietUntilTime(existingStatus)),
        quietWindowSource: existingStatus.quietWindowSource || '',
      };
    });
  } catch (error) {
    liveActivityOperations.delete(token);
    throw error;
  }

  return { token, activeUntil, status };
}

export async function markGitHubActivityFinished(activity = {}, source = 'github') {
  const finishedTime = Date.now();
  const finishedAt = new Date(finishedTime).toISOString();
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
      quietUntil: maxIsoTime(
        existingStatus.quietWindowSource ? getQuietUntilTime(existingStatus) : 0,
        finishedTime + GITHUB_ACTIVITY_QUIET_WINDOW_MS,
      ),
      quietWindowSource: existingStatus.quietWindowSource && getQuietUntilTime(existingStatus) > finishedTime + GITHUB_ACTIVITY_QUIET_WINDOW_MS
        ? existingStatus.quietWindowSource
        : 'normal',
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

export async function extendGitHubQuietWindowUntil(quietUntil, source = 'rate-limit') {
  const quietUntilTime = Date.parse(quietUntil || '');
  if (!Number.isFinite(quietUntilTime) || quietUntilTime <= Date.now()) {
    return getGitHubActivityStatus();
  }

  return updateGitHubActivityStatus((existingStatus) => ({
    ...existingStatus,
    lastFinishedSource: source,
    quietUntil: maxIsoTime(getQuietUntilTime(existingStatus), quietUntilTime),
    quietWindowSource: source,
  }));
}

export function getGitHubQuietWindowRemainingMs(activity, now = Date.now()) {
  if (activity?.active && !activity?.activeOperations) return GITHUB_ACTIVITY_STALE_MS;
  const status = normalizeActivityStatus(activity, now);
  if (status.active) {
    const activeUntilTimes = Object.values(status.activeOperations || {})
      .map((operation) => Date.parse(operation?.activeUntil || ''))
      .filter(Number.isFinite);
    const activeUntilTime = activeUntilTimes.length > 0 ? Math.max(...activeUntilTimes) : now;
    return Math.max(1000, activeUntilTime - now);
  }
  const quietUntilTime = getQuietUntilTime(status);
  return Number.isFinite(quietUntilTime) ? Math.max(0, quietUntilTime - now) : 0;
}

export function isGitHubQuiet(activity, now = Date.now()) {
  return getGitHubQuietWindowRemainingMs(activity, now) <= 0;
}

export function __resetGitHubActivityLiveOperationsForTest() {
  liveActivityOperations.clear();
}

export function __getGitHubActivityLiveOperationCountForTest() {
  return liveActivityOperations.size;
}
