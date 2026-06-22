export async function closeExtensionPage() {
  window.close();

  if (!globalThis.chrome?.tabs?.getCurrent || !globalThis.chrome?.tabs?.remove) {
    return;
  }

  try {
    const tab = await chrome.tabs.getCurrent();

    if (tab?.id) {
      await chrome.tabs.remove(tab.id);
    }
  } catch (error) {
    // Closing is best-effort; some extension contexts cannot remove their tab.
  }
}
