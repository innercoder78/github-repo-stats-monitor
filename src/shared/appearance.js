import { getSettings, normalizeAppearance } from './storage.js';

export function applyAppearance(appearance) {
  const normalizedAppearance = normalizeAppearance(appearance);
  document.documentElement.dataset.appearance = normalizedAppearance;
  document.documentElement.style.colorScheme = normalizedAppearance;
  return normalizedAppearance;
}

export async function applySavedAppearance() {
  try {
    const settings = await getSettings();
    return applyAppearance(settings.appearance);
  } catch (error) {
    return applyAppearance('light');
  }
}
