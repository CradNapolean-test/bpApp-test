'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { UPDATE_READY_EVENT, VERSION_CHECK_EVERY_MS, isNewerVersion } from '@/lib/appVersion';

// "A new version is ready" (R8). Shown when the server is on a newer deployment than the one this page was loaded from, or when the
// service worker has been replaced. The member taps Update; nothing reloads by itself, so a half-filled form or an open sheet is never
// thrown away (the old service worker registration used to reload the page the next time the app was brought forward, mid-typing).
export function UpdateBanner({ currentVersion }: { currentVersion: string }) {
  const [ready, setReady] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const onWorkerUpdated = () => setReady(true);
    window.addEventListener(UPDATE_READY_EVENT, onWorkerUpdated);

    let checking = false;
    const check = async () => {
      if (checking || document.visibilityState !== 'visible') return;
      checking = true;
      try {
        const response = await fetch('/api/version', { cache: 'no-store' });
        if (!response.ok) return;
        const body = (await response.json()) as { version?: string };
        if (isNewerVersion(currentVersion, body.version)) setReady(true);
      } catch {
        // Offline or a hiccup: ask again next time.
      } finally {
        checking = false;
      }
    };
    document.addEventListener('visibilitychange', check);
    const timer = window.setInterval(check, VERSION_CHECK_EVERY_MS);
    return () => {
      window.removeEventListener(UPDATE_READY_EVENT, onWorkerUpdated);
      document.removeEventListener('visibilitychange', check);
      window.clearInterval(timer);
    };
  }, [currentVersion]);

  if (!ready || dismissed) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-3 top-[max(0.75rem,env(safe-area-inset-top))] z-[95] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-accent/30 bg-card p-3 shadow-xl"
    >
      <RefreshCw className="h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-sm font-semibold text-black dark:text-zinc-50">A new version is ready.</p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded-full bg-accent px-4 py-1.5 text-sm font-extrabold text-accent-foreground"
      >
        Update
      </button>
      <button type="button" onClick={() => setDismissed(true)} className="shrink-0 px-1 text-sm font-semibold text-zinc-500">
        Later
      </button>
    </div>
  );
}
