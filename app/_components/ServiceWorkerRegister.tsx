'use client';

import { useEffect } from 'react';
import { UPDATE_READY_EVENT } from '@/lib/appVersion';

// Mounted once near the root (RootLayout). Registers /sw.js on every visit (cheap, a no-op if
// unchanged). When a newer version takes over, the open page is still running old code: it says so
// (UpdateBanner shows "A new version is ready") and the member taps Update. It used to reload the page by
// itself the next time the app came forward, which threw away what was being typed (R8). Actually
// subscribing to push is a separate, explicit user action (see PushPrompt / the Profile toggle).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // controller is null on a first-ever visit: the first claim is not an update.
    const hadController = !!navigator.serviceWorker.controller;
    const onControllerChange = () => {
      if (hadController) window.dispatchEvent(new Event(UPDATE_READY_EVENT));
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker
      .register('/sw.js')
      .then((registration) => {
        // Check for a new version whenever the app returns to the foreground.
        const check = () => {
          if (document.visibilityState === 'visible') registration.update().catch(() => {});
        };
        document.addEventListener('visibilitychange', check);
      })
      .catch(() => {
        // Best-effort -- an unsupported/blocked browser just means push/offline stay unavailable.
      });

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  return null;
}
