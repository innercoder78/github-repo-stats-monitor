export const GITHUB_ACTIVITY_KEY = 'githubActivityStatus';
export const GITHUB_ACTIVITY_STALE_MS = 30 * 60 * 1000;

function getStorageArea() {
  return chrome.storage.local;
}

function createActivityToken(source) {
  return `${source || 'github'}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function toIsoTime(timestamp) {
  return new Date(timestamp).toISOString();
}

function getQuietUntilFromStartedAt(startedAt) {
  const startedTime = Date.parse(startedAt || '');
  return Number.isFinite(startedTime) ? toIsoTime(startedTime + GITHUB_ACTIVITY_STALE_MS) : '';
}

function normalizeActivityStatus(status, now = Date.now()) {
  const activity = status && typeof status === 'object' ? status : {};
  const activeUntil = Date.parse(activity.activeUntil || getQuietUntilFromStartedAt(activity.activeStartedAt));
  const activeToken = typeof activity.activeToken === 'string' ? activity.activeToken : '';
  const active = Boolean(activeToken) && Number.isFinite(activeUntil) && now < activeUntil;

  return {
    active,
    activeToken: active ? activeToken : '',
    activeSource: active && typeof activity.activeSource === 'string' ? activity.activeSource : '',
    activeStartedAt: active && typeof activity.activeStartedAt === 'string' ? activity.activeStartedAt : '',
    activeUntil: active && typeof activity.activeUntil === 'string' ? activity.activeUntil : '',
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
  const activeToken = createActivityToken(source);
  const existingStatus = await getGitHubActivityStatus();
  const activeUntil = toIsoTime(Date.now() + GITHUB_ACTIVITY_STALE_MS);
  const status = await saveGitHubActivityStatus({
    ...existingStatus,
    activeToken,
    activeSource: source,
    activeStartedAt: startedAt,
    activeUntil,
    quietUntil: activeUntil,
  });
  return { token: activeToken, status };
}

export async function markGitHubActivityFinished(activity = {}, source = 'github') {
  const finishedAt = new Date().toISOString();
  const existingStatus = await getGitHubActivityStatus();
  const quietUntil = toIsoTime(Date.now() + 2 * 60 * 1000);
  const ownsActiveMarker = existingStatus.activeToken && existingStatus.activeToken === activity.token;
  const status = {
    ...existingStatus,
    lastFinishedAt: finishedAt,
    lastFinishedSource: source,
    quietUntil: ownsActiveMarker ? quietUntil : existingStatus.quietUntil,
  };

  if (ownsActiveMarker) {
    status.activeToken = '';
    status.activeSource = '';
    status.activeStartedAt = '';
    status.activeUntil = '';
  }

  return saveGitHubActivityStatus(status);
}

export async function runTrackedGitHubActivity(source, task) {
  const activity = await markGitHubActivityStarted(source);
  try {
    return await task();
  } finally {
    await markGitHubActivityFinished(activity, source);
  }
}
