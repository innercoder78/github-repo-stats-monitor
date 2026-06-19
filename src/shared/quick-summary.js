const QUICK_SUMMARY_FALLBACK_MESSAGE = 'Click the toolbar icon to open Quick Summary.';

function showFallbackMessage(messageElement) {
  if (!messageElement) {
    return;
  }

  messageElement.textContent = QUICK_SUMMARY_FALLBACK_MESSAGE;
}

async function closeCurrentExtensionTab() {
  const chromeApi = globalThis.chrome;

  if (!chromeApi?.tabs?.getCurrent || !chromeApi?.tabs?.remove) {
    return;
  }

  const currentTab = await chromeApi.tabs.getCurrent();
  if (currentTab?.id === undefined) {
    return;
  }

  await chromeApi.tabs.remove(currentTab.id);
}

export async function openQuickSummary(messageElement) {
  if (messageElement) {
    messageElement.textContent = '';
  }

  const chromeApi = globalThis.chrome;

  if (!chromeApi?.action?.openPopup) {
    showFallbackMessage(messageElement);
    return false;
  }

  try {
    await chromeApi.action.openPopup();
  } catch {
    showFallbackMessage(messageElement);
    return false;
  }

  try {
    await closeCurrentExtensionTab();
  } catch {
    // Quick Summary opened successfully. Leave this tab open if Chrome cannot close it.
  }

  return true;
}
