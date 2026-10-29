import { useSyncExternalStore } from 'react';
import { useColorScheme } from 'react-native';

import { DEFAULT_THEME, isThemePreference, resolveScheme, type ThemePreference } from '@ballistic/shared/utils/account';

import { authStorage } from '@/lib/authStorage';

// Mirrors the web app's tokens (apps/web/app/globals.css): teal brand accent, black-ish dark mode.
export const palettes = {
  light: {
    background: '#fdfcfb',
    foreground: '#171717',
    card: '#ffffff',
    cardMuted: '#f4f4f5',
    accent: '#19adb1',
    accentStrong: '#0e6266',
    // The accent as TEXT: the brand teal is too pale for small text on a light background, so light mode uses a deeper teal.
    accentText: '#0e6266',
    accentForeground: '#ffffff',
    accentSoft: '#eafcfc',
    // The accent at 30%: the border of a tinted card (web: border-accent/30).
    accentBorder: 'rgba(25,173,177,0.3)',
    danger: '#dc2626',
    success: '#10b981',
    warning: '#f59e0b',
    muted: '#71717a',
    // Icons on the header tiles (web: zinc-600 / zinc-300).
    chromeIcon: '#52525b',
    border: 'rgba(0,0,0,0.1)',
  },
  dark: {
    background: '#111111',
    foreground: '#f0f0f0',
    card: '#1e1e1e',
    cardMuted: '#262626',
    accent: '#2abfbf',
    accentStrong: '#5fd6d6',
    accentText: '#2abfbf',
    accentForeground: '#041f1f',
    accentSoft: 'rgba(42,191,191,0.12)',
    accentBorder: 'rgba(42,191,191,0.3)',
    danger: '#f87171',
    success: '#34d399',
    warning: '#fbbf24',
    muted: '#a1a1aa',
    chromeIcon: '#d4d4d8',
    border: 'rgba(255,255,255,0.1)',
  },
} as const;

export type Palette = { [K in keyof (typeof palettes)['light']]: string };

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;
export const radius = { md: 12, lg: 16 } as const;

// The member's Light / Dark / System choice. It is kept on the device so the app opens in the right theme with no flash,
// and on the profile (profiles.theme_preference) so it follows them to another device. Nothing chosen yet means dark.
const STORAGE_KEY = 'bp-theme-preference';

function readStored(): ThemePreference {
  try {
    const v = authStorage.getItem(STORAGE_KEY);
    return isThemePreference(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME; // storage can be blocked; the choice still works for this session
  }
}

let preference: ThemePreference = readStored();
const listeners = new Set<() => void>();

// Applies the choice at once on this device (the caller saves it to the profile).
export function setLocalThemePreference(next: ThemePreference) {
  if (next === preference) return;
  preference = next;
  try {
    authStorage.setItem(STORAGE_KEY, next);
  } catch {
    // not saved on this device; still applied for now
  }
  listeners.forEach((l) => l());
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => preference,
    () => preference,
  );
}

export function useResolvedScheme(): 'light' | 'dark' {
  const system = useColorScheme();
  return resolveScheme(useThemePreference(), system === 'light' || system === 'dark' ? system : null);
}

export function useTheme(): Palette {
  return palettes[useResolvedScheme()];
}
