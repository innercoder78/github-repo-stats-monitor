import { renderSummaryImagePng } from '../../src/shared/summary-image.js';

const base = {
  username: 'example-developer', followers: 3742, stars: 14896, forks: 6318, watchers: 2179,
  configuredRepositories: 48, validRepositories: 48, dataAsOf: '2026-11-08T16:39:00Z',
};
const fixtures = {
  reference: base,
  zero: { ...base, followers: 0, stars: 0, forks: 0, watchers: 0, configuredRepositories: 2, validRepositories: 2 },
  partial: { ...base, followers: null, configuredRepositories: 12, validRepositories: 10 },
  missing: { ...base, username: '', followers: null, stars: null, forks: null, watchers: null, validRepositories: 0, configuredRepositories: 12, dataAsOf: null },
  long: { ...base, username: 'fictional-user-with-a-very-long-name-1234', stars: Number.MAX_SAFE_INTEGER, followers: 123456789, forks: 1234567890, watchers: 9876543210, displayPreferences: { dateFormat: 'yyyy/mm/dd', timeFormat: '12-hour' } },
};
let url;
let generation = 0;
async function render() {
  const current = ++generation;
  const status = document.getElementById('status');
  const download = document.getElementById('download');
  download.hidden = true;
  status.textContent = 'Rendering…';
  try {
    const blob = await renderSummaryImagePng(fixtures[document.getElementById('fixture').value]);
    if (current !== generation) return;
    if (url) URL.revokeObjectURL(url);
    url = URL.createObjectURL(blob);
    document.getElementById('preview').src = url;
    download.href = url; download.hidden = false;
    status.textContent = `1080 × 1440 PNG · ${blob.size.toLocaleString()} bytes · ${navigator.userAgent}`;
  } catch (error) { if (current === generation) status.textContent = `Preview failed: ${error.message}`; }
}
document.getElementById('render').addEventListener('click', render);
document.getElementById('fixture').addEventListener('change', render);
window.addEventListener('pagehide', () => { if (url) URL.revokeObjectURL(url); });
render();
