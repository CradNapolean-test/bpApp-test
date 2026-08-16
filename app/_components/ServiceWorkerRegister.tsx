'use client';

import { useEffect } from 'react';

// Mounted once near the root (RootLayout), mirrors ThemeSync's pattern. Registers /sw.js
// unconditionally on every visit -- registration itself is cheap and a no-op if unchanged;
// actually subscribing to push is a separate, explicit user action (see the Account tab's
// push-notifications toggle), not triggered by this.
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Best-effort -- an unsupported/blocked browser just means push stays unavailable,
      // not a broken app.
    });
  }, []);

  return null;
}
