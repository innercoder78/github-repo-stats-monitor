const QUICK_SUMMARY_FALLBACK_MESSAGE = 'Click the toolbar icon to open Quick Summary.';

function showMessage(messageElement, message) {
  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
}

export async function openQuickSummary(messageElement) {
  showMessage(messageElement, '');

  const chromeApi = globalThis.chrome;

  if (!chromeApi?.action?.openPopup) {
    showMessage(messageElement, QUICK_SUMMARY_FALLBACK_MESSAGE);
    return false;
  }

  try {
    await chromeApi.action.openPopup();
  } catch {
    showMessage(messageElement, QUICK_SUMMARY_FALLBACK_MESSAGE);
    return false;
  }

  return true;
}
