// Export-only provenance. Never retain another copy of the token in storage.
export async function summaryImageAccountContext(token, account) {
  if (!token || !account?.login || !account?.fetchedAt) return null;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return {
    tokenHash: Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, '0')).join(''),
    login: account.login,
    fetchedAt: account.fetchedAt,
  };
}
