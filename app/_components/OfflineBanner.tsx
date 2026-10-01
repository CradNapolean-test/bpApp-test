'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

// A slim bar when the phone loses its connection, so a failed save never looks like a bug.
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    Promise.resolve().then(update);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  if (!offline) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-[90] flex items-center justify-center gap-2 bg-amber-500 px-3 pb-1.5 pt-[max(0.375rem,env(safe-area-inset-top))] text-xs font-bold text-black"
    >
      <WifiOff className="h-3.5 w-3.5" /> You&apos;re offline. Changes won&apos;t save until you&apos;re back online.
    </div>
  );
}
