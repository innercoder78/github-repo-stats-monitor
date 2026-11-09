// Development-only Chrome API simulation. No credentials or network requests.
document.documentElement.dataset.previewBrowser = navigator.userAgent;
const saved = {
  githubToken: '', repositories: ['fictional/one', 'fictional/two'],
  appearance: new URL(location.href).searchParams.get('appearance') === 'dark' ? 'dark' : 'light',
  displayPreferences: { dateFormat: 'yyyy/mm/dd', timeFormat: '24-hour' },
  accountStats: { login: 'fictional-developer', followers: 42, fetchedAt: '2026-11-08T12:00:00Z' },
  latestStats: {
    'fictional/one': { stars: 120, forks: 30, subscribers: 12, fetchedAt: '2026-11-07T12:00:00Z' },
    'fictional/two': { stars: 0, forks: 0, subscribers: 0, fetchedAt: '2026-11-08T12:00:00Z' },
  },
};
globalThis.chrome = {
  runtime: {
    getManifest: () => ({ version: '3.2' }), getURL: (path) => `/${path}`,
    onMessage: { addListener() {} },
    async sendMessage(message) {
      if (!message.action.startsWith('activity.')) throw new Error('GitHub refresh is unavailable in this fictional preview.');
      return { ok: true, result: {} };
    },
    openOptionsPage() {},
  },
  storage: {
    local: {
      get(defaults, callback) { callback(structuredClone({ ...defaults, ...Object.fromEntries(Object.entries(saved).filter(([key]) => key in defaults)) })); },
    },
    onChanged: { addListener() {} },
  },
  tabs: { create() {} },
};
