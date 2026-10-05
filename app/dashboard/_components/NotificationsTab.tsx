'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, X } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { clearAllNotifications, clearNotification, markRead } from '@/lib/data/notifications';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { NotificationRow } from '@/lib/data/types';

function relativeAgo(iso: string): string {
  const rel = formatRelativeTime(iso);
  return rel === 'now' ? 'Just now' : `${rel} ago`;
}

// Notifications live behind the header bell. Opening the screen marks them seen (the bell dot goes),
// but they stay in the list until the member clears them: one at a time with the X, or all at once.
export function NotificationsTab({ clientId, notifications, readOnly = false }: { clientId: string; notifications: NotificationRow[]; readOnly?: boolean }) {
  const router = useRouter();
  const markedRef = useRef(false);
  const [cleared, setCleared] = useState<Set<string>>(new Set());
  const visible = notifications.filter((n) => !cleared.has(n.id));

  useEffect(() => {
    // A coach looking at a member's notifications must not mark or clear them.
    if (readOnly || markedRef.current) return;
    markedRef.current = true;
    const unread = notifications.filter((n) => !n.read_at);
    if (unread.length === 0) return;
    Promise.all(unread.map((n) => markRead(n.id))).then(() => router.refresh());
  }, [notifications, router, readOnly]);

  async function clearOne(id: string) {
    setCleared((prev) => new Set(prev).add(id));
    await clearNotification(id);
    router.refresh();
  }

  async function clearAll() {
    setCleared(new Set(notifications.map((n) => n.id)));
    await clearAllNotifications(clientId);
    router.refresh();
  }

  if (visible.length === 0) {
    return <EmptyState icon={Bell} title="No notifications" hint="You're all caught up." />;
  }

  return (
    <div>
      {!readOnly && (
        <div className="mb-1 flex justify-end">
          <button type="button" onClick={clearAll} className="rounded-full px-3 py-1.5 text-xs font-bold text-accent">
            Clear all
          </button>
        </div>
      )}
      <div className="divide-y divide-black/5 dark:divide-white/5">
        {visible.map((n) => (
          <div key={n.id} className="flex items-start gap-2.5 py-3">
            <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-accent'}`} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{n.message}</p>
              <p className="mt-0.5 text-xs text-zinc-400">{relativeAgo(n.created_at)}</p>
            </div>
            {!readOnly && (
              <button type="button" aria-label="Clear notification" onClick={() => clearOne(n.id)} className="shrink-0 rounded-full p-1.5 text-zinc-400 hover:text-black dark:hover:text-zinc-100">
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
