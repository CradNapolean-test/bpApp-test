'use client';

import { useEffect } from 'react';

// Mounted once near the root (RootLayout). Registers /sw.js on every visit (cheap, a no-op if
// unchanged). When a newer version takes over, the open page is still running old code, so reload
// it the next time the app comes back to the foreground (never mid-task). Actually subscribing to
// push is a separate, explicit user action (see PushPrompt / the Profile toggle).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    // controller is null on a first-ever visit: the first claim is not an update.
    const hadController = !!navigator.serviceWorker.controller;
    let updated = false;
    const onControllerChange = () => {
      if (hadController) updated = true;
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible' && updated) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    document.addEventListener('visibilitychange', onVisible);

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
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  return null;
}
