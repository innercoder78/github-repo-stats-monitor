// Export-only provenance. Never retain another copy of the token in storage.
export async function summaryImageTokenHash(token) {
  if (!token) return '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function selectSummaryImageRepositories(latestStats, tokenHash) {
  // Unknown/legacy or other-token metadata remains in the normal cache, but
  // cannot contribute to an image associated with the current account.
  return Object.fromEntries(Object.entries(latestStats || {}).filter(([, stats]) =>
    tokenHash && stats?.summaryImageTokenHash === tokenHash));
}

export async function summaryImageAccountContext(token, account) {
  if (!token || !account?.login || !account?.fetchedAt) return null;
  return {
    tokenHash: await summaryImageTokenHash(token),
    login: account.login,
    fetchedAt: account.fetchedAt,
  };
}
