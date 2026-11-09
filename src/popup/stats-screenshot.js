import { prepareSummaryImageData } from '../shared/summary-image-data.js';
import { renderSummaryImagePng } from '../shared/summary-image.js';
import { summaryImageAccountContext, summaryImageTokenHash, selectSummaryImageRepositories } from '../shared/summary-image-account.js';

// Read raw values together: the general UI storage normalizers substitute zero for
// missing numbers. Export must preserve the renderer's unavailable/zero distinction.
const SNAPSHOT_DEFAULTS = {
  githubToken: '', repositories: [], latestStats: {}, accountStats: null, displayPreferences: {},
  summaryImageAccountContext: 'legacy',
};
const CHANGED_MESSAGE = 'Saved data or account settings changed. Reopen Quick Summary and try again.';

function readSnapshot() {
  return new Promise((resolve, reject) => {
    chrome.storage.local.get(SNAPSHOT_DEFAULTS, (snapshot) => {
      if (chrome.runtime.lastError) reject(new Error('Unable to read saved statistics.'));
      else resolve(snapshot);
    });
  });
}

export function initializeStatsScreenshot() {
  const button = document.getElementById('stats-screenshot');
  const status = document.getElementById('screenshot-status');
  if (!button || !status) return;
  let busy = false;
  let closed = false;
  let revision = 0;
  let accountChanged = false;
  const pendingUrls = new Map();
  const showStatus = (message) => { status.hidden = false; status.textContent = message; };

  // Observe changes even while idle, including token A -> B -> A. Never write
  // storage or enter the popup's rendering/activity acknowledgment paths.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(SNAPSHOT_DEFAULTS).some((key) => Object.hasOwn(changes, key))) revision += 1;
    if (changes.githubToken) accountChanged = true;
  });

  function releaseUrl(url) {
    clearTimeout(pendingUrls.get(url));
    pendingUrls.delete(url);
    URL.revokeObjectURL(url);
  }

  // Do not revoke on pagehide: Chrome may still be consuming the download URL.
  // Document destruction releases its Blob URLs automatically. For an open
  // popup, a grace period keeps the URL alive beyond dispatch of the click.
  window.addEventListener?.('pagehide', () => {
    closed = true;
    pendingUrls.forEach((timer) => clearTimeout(timer));
    pendingUrls.clear();
  });

  button.addEventListener('click', async () => {
    if (busy || closed) return;
    busy = true;
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    showStatus('Generating PNG… Keep Quick Summary open.');
    let url;
    let link;
    let requested = false;
    let failureMessage = 'Unable to generate screenshot. Please try again.';
    try {
      if (accountChanged) throw new Error(CHANGED_MESSAGE);
      const initialRevision = revision;
      failureMessage = 'Unable to read saved statistics. Please try again.';
      const snapshot = await readSnapshot();
      // Never infer historical account ownership from the current settings.
      // Legacy followers lack provenance and are unavailable in exports until
      // refreshed, even when repository metadata is verified for this token.
      const context = snapshot.summaryImageAccountContext;
      if (context !== 'legacy' && snapshot.accountStats?.login) {
        failureMessage = 'Account settings changed. Use Refresh before exporting account statistics.';
        const expected = await summaryImageAccountContext(snapshot.githubToken, snapshot.accountStats);
        if (!context || !expected || context.tokenHash !== expected.tokenHash
            || context.login !== expected.login || context.fetchedAt !== expected.fetchedAt) {
          throw new Error(failureMessage);
        }
      }
      failureMessage = 'Saved statistics are unavailable, unverified or invalid. Use Refresh, then try again.';
      const tokenHash = await summaryImageTokenHash(snapshot.githubToken);
      const eligibleStats = selectSummaryImageRepositories(snapshot.latestStats, tokenHash);
      const data = prepareSummaryImageData({
        ...snapshot,
        accountStats: context === 'legacy' ? null : snapshot.accountStats,
        latestStats: eligibleStats,
      });
      if (data.configuredRepositories === 0) {
        failureMessage = 'Add repositories in Settings before exporting a screenshot.';
        throw new Error(failureMessage);
      }
      if (data.followers === null && data.validRepositories === 0) throw new Error(failureMessage);
      failureMessage = 'Unable to generate screenshot. Please try again.';
      const blob = await renderSummaryImagePng(data);
      failureMessage = 'Unable to verify saved statistics. Please try again.';
      const current = await readSnapshot();
      if (closed) return;
      // Recheck after asynchronous font loading/PNG encoding. Tokens remain only
      // in memory for equality checks, never in the renderer, DOM, URL or logs.
      if (accountChanged || initialRevision !== revision || JSON.stringify(snapshot) !== JSON.stringify(current)) {
        failureMessage = CHANGED_MESSAGE;
        throw new Error(failureMessage);
      }
      failureMessage = 'Unable to request the PNG download. Please try again.';
      url = URL.createObjectURL(blob);
      link = document.createElement('a');
      link.href = url;
      link.download = 'repository-summary.png';
      link.hidden = true;
      document.body.append(link);
      link.click();
      requested = true;
      pendingUrls.set(url, setTimeout(() => releaseUrl(url), 60000));
      const unverifiedCount = snapshot.repositories.filter((repository) =>
        snapshot.latestStats[repository] && !Object.hasOwn(eligibleStats, repository)).length;
      showStatus('Download requested. Check Chrome Downloads.' + (unverifiedCount
        ? ` ${unverifiedCount} of ${data.configuredRepositories} repositories omitted because their saved statistics are unverified for the current account. Use Refresh; if recent data was reused, wait at least one minute and refresh again. Failed requests leave those statistics unverified.`
        : ''));
    } catch {
      if (!closed) showStatus(accountChanged ? CHANGED_MESSAGE : failureMessage);
    } finally {
      link?.remove();
      if (url && !requested) releaseUrl(url);
      busy = false;
      button.disabled = false;
      button.setAttribute('aria-busy', 'false');
    }
  });
}
