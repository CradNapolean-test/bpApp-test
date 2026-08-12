'use client';

import { useEffect } from 'react';
import { applyTheme, readStoredTheme } from './theme';
import type { ThemePreference } from './theme';

// Mounted once near the root (RootLayout). Reconciles localStorage (used for the zero-flash
// first paint, see the inline script in layout.tsx) against the server-fetched DB preference,
// so a preference set on one device shows up on another without waiting for this device's
// own Account Settings page to be visited. Also keeps "System" live if the OS theme changes
// while the tab is open -- the old @media-only approach got this for free, a class-based
// strategy has to replicate it explicitly.
export function ThemeSync({ dbPreference }: { dbPreference: ThemePreference }) {
  useEffect(() => {
    if (readStoredTheme() !== dbPreference) {
      applyTheme(dbPreference);
    }

    if (dbPreference !== 'system') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, [dbPreference]);

  return null;
}
