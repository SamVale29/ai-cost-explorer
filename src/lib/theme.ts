export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'ace-theme';
const DEFAULT_THEME: Theme = 'dark';

export function readStoredTheme(): Theme {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY) === 'light' ? 'light' : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function storeTheme(theme: Theme): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Theme persistence is best effort; rendering must work when storage is blocked.
  }
}
