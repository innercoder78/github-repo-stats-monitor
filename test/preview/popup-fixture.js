// Development-only Chrome API simulation. No credentials or network requests.
document.documentElement.dataset.previewBrowser = navigator.userAgent;
const saved = {
  githubToken: 'fictional-preview-only', repositories: ['fictional/one', 'fictional/two'],
  appearance: new URL(location.href).searchParams.get('appearance') === 'dark' ? 'dark' : 'light',
  displayPreferences: { dateFormat: 'yyyy/mm/dd', timeFormat: '24-hour' },
  accountStats: { login: 'fictional-developer', followers: 42, fetchedAt: '2026-11-08T12:00:00Z' },
  latestStats: {
    'fictional/one': { stars: 120, forks: 30, subscribers: 12, fetchedAt: '2026-11-07T12:00:00Z' },
    'fictional/two': { stars: 0, forks: 0, subscribers: 0, fetchedAt: '2026-11-08T12:00:00Z' },
  },
};
// Hash is fixture provenance only, not an actual credential or network operation.
const fixtureReady = crypto.subtle.digest('SHA-256', new TextEncoder().encode(saved.githubToken)).then(async (bytes) => {
  const tokenHash = Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
  saved.summaryImageAccountContext = { tokenHash, login: saved.accountStats.login, fetchedAt: saved.accountStats.fetchedAt };
  for (const stats of Object.values(saved.latestStats)) stats.summaryImageTokenHash = tokenHash;
  const scenario = new URL(location.href).searchParams.get('scenario');
  if (scenario === 'mixed') {
    saved.accountStats.login = 'fictional-b'; saved.accountStats.followers = 22;
    saved.summaryImageAccountContext.login = saved.accountStats.login;
    const previous = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('fictional-previous-token'));
    saved.latestStats['fictional/one'].summaryImageTokenHash = Array.from(new Uint8Array(previous), (byte) => byte.toString(16).padStart(2, '0')).join('');
    saved.latestStats['fictional/one'].stars = 321;
    saved.latestStats['fictional/one'].error = 'Fictional metadata access denied';
  } else if (scenario === 'legacy') {
    delete saved.summaryImageAccountContext;
    for (const stats of Object.values(saved.latestStats)) delete stats.summaryImageTokenHash;
  }
});
globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.3' }), getURL: (path) => `/${path}`,
    onMessage: { addListener() {} },
    async sendMessage(message) {
      if (!message.action.startsWith('activity.')) throw new Error('GitHub refresh is unavailable in this fictional preview.');
      return { ok: true, result: {} };
    },
    openOptionsPage() {},
  },
  storage: {
    local: {
      get(defaults, callback) { fixtureReady.then(() => callback(structuredClone({ ...defaults, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaults)) }))); },
    },
    onChanged: { addListener() {} },
  },
  tabs: { create() {} },
};
