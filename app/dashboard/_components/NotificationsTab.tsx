'use client';

import { useEffect, useRef } from 'react';
import { Bell } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { markRead } from '@/lib/data/notifications';
import type { NotificationRow } from '@/lib/data/types';

// Replaces the always-visible amber NotificationBanner that used to sit on top of every
// screen -- notifications now live behind the header bell icon (unread dot) as a proper
// screen, matching the redesign's badge+screen pattern instead of an unprompted banner dump.
export function NotificationsTab({ notifications }: { notifications: NotificationRow[] }) {
  const markedRef = useRef(false);

  useEffect(() => {
    if (markedRef.current) return;
    markedRef.current = true;
    notifications.filter((n) => !n.read_at).forEach((n) => {
      markRead(n.id);
    });
  }, [notifications]);

  if (notifications.length === 0) {
    return <EmptyState icon={Bell} title="No notifications" hint="You're all caught up." />;
  }

  return (
    <div className="divide-y divide-black/5 dark:divide-white/5">
      {notifications.map((n) => (
        <div key={n.id} className="flex items-start gap-2.5 py-3">
          <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-accent" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-black dark:text-zinc-50">{n.message}</p>
            <p className="mt-0.5 text-xs text-zinc-400">{new Date(n.created_at).toLocaleString()}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
