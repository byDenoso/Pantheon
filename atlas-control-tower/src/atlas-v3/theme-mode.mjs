export const THEME_STORAGE_KEY = 'nexo-atlas-v3-theme';

const MODES = new Set(['system', 'light', 'dark']);

function browserStorage() {
  if (typeof window === 'undefined') return null;
  try { return window.localStorage; } catch { return null; }
}

export function readThemeMode(storage = browserStorage()) {
  try {
    const value = storage?.getItem(THEME_STORAGE_KEY);
    return MODES.has(value) ? value : 'system';
  } catch {
    return 'system';
  }
}

export function resolveTheme(mode, systemDark) {
  return mode === 'dark' || (mode === 'system' && systemDark) ? 'dark' : 'light';
}

export function persistThemeMode(mode, storage = browserStorage()) {
  try { storage?.setItem(THEME_STORAGE_KEY, mode); } catch { /* storage is optional */ }
}
