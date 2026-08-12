// Plain client-safe theme utilities -- NOT 'use server', shared between the inline
// FOUC-blocking script's logic (duplicated there as a string, since that has to run
// synchronously before hydration with zero imports) and post-hydration React components.

export type ThemePreference = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'theme';

export function resolveEffectiveTheme(preference: ThemePreference): 'light' | 'dark' {
  if (preference === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return preference;
}

export function applyTheme(preference: ThemePreference): void {
  localStorage.setItem(STORAGE_KEY, preference);
  document.documentElement.classList.toggle('dark', resolveEffectiveTheme(preference) === 'dark');
}

export function readStoredTheme(): ThemePreference {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
}
