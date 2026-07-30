'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { markRead } from '@/lib/data/notifications';
import type { NotificationRow } from '@/lib/data/types';

export function NotificationBanner({ notifications }: { notifications: NotificationRow[] }) {
  const { run } = useAction();
  const [dismissing, setDismissing] = useState<string | null>(null);

  async function handleDismiss(id: string) {
    setDismissing(id);
    try {
      await run(() => markRead(id));
    } finally {
      setDismissing(null);
    }
  }

  if (notifications.length === 0) return null;

  return (
    <div className="mt-6 space-y-2">
      {notifications.map((n) => (
        <div
          key={n.id}
          className="flex items-center justify-between rounded-lg border border-amber-600/30 bg-amber-50 p-3 text-sm dark:bg-amber-950/30"
        >
          <span className="text-amber-800 dark:text-amber-300">{n.message}</span>
          <button
            onClick={() => handleDismiss(n.id)}
            disabled={dismissing === n.id}
            className="ml-3 shrink-0 text-xs font-medium text-amber-700 hover:underline disabled:opacity-50 dark:text-amber-400"
          >
            Dismiss
          </button>
        </div>
      ))}
    </div>
  );
}
