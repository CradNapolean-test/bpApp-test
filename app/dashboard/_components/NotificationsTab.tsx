'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, CalendarCheck, ClipboardList, Coins, MessageSquare, Trophy, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { clearAllNotifications, clearNotification, markAllNotificationsRead } from '@/lib/data/notifications';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { NotificationRow } from '@/lib/data/types';
import { gsap, prefersReducedMotion, useGSAP } from '@/app/_components/motion/gsap';

function relativeAgo(iso: string): string {
  const rel = formatRelativeTime(iso);
  return rel === 'now' ? 'Just now' : `${rel} ago`;
}

// A notification is one line of text, so its icon is read from the words (the board gives each kind its own).
function iconFor(message: string): LucideIcon {
  if (/message|voice note|replied|photo/i.test(message)) return MessageSquare;
  if (/book|class|session|waitlist|spot|cancel/i.test(message)) return CalendarCheck;
  if (/form|check-in|check in|questionnaire/i.test(message)) return ClipboardList;
  if (/credit/i.test(message)) return Coins;
  if (/event|reward|challenge|club|record|badge/i.test(message)) return Trophy;
  return Bell;
}

const isToday = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

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
    // One request, not one per notification (NO1).
    markAllNotificationsRead(clientId)
      .then(() => router.refresh())
      .catch(() => {});
  }, [notifications, router, readOnly, clientId]);

  // A cleared notification slides off to the right and its row closes up, rather than the list jumping; clearing them all sends the rows
  // off one after another. The rows go from the list once they are gone, while the server is told at the same time.
  const list = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP({ scope: list });
  const slideOut = contextSafe((rows: Element[], done: () => void) => {
    if (rows.length === 0 || prefersReducedMotion()) return done();
    gsap.to(rows, {
      x: 48,
      opacity: 0,
      height: 0,
      minHeight: 0,
      paddingTop: 0,
      paddingBottom: 0,
      duration: 0.3,
      ease: 'power2.in',
      stagger: 0.04,
      onComplete: done,
    });
  });
  const gone = (rows: Element[]) => new Promise<void>((resolve) => slideOut(rows, resolve));

  async function clearOne(id: string, row: Element | null) {
    await Promise.all([gone(row ? [row] : []).then(() => setCleared((prev) => new Set(prev).add(id))), clearNotification(id)]);
    router.refresh();
  }

  async function clearAll() {
    const rows = Array.from(list.current?.querySelectorAll('[data-note]') ?? []);
    await Promise.all([gone(rows).then(() => setCleared(new Set(notifications.map((n) => n.id)))), clearAllNotifications(clientId)]);
    router.refresh();
  }

  if (visible.length === 0) {
    return <EmptyState icon={Bell} title="No notifications" hint="You're all caught up." />;
  }

  // Today's first, then everything before (the board), each group in one card.
  const groups = [
    { title: 'Today', items: visible.filter((n) => isToday(n.created_at)) },
    { title: 'Earlier', items: visible.filter((n) => !isToday(n.created_at)) },
  ].filter((g) => g.items.length > 0);

  return (
    <div ref={list} className="space-y-5">
      {groups.map((g, gi) => (
        <section key={g.title} className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-base font-extrabold text-black dark:text-zinc-50">{g.title}</h2>
            {!readOnly && gi === 0 && (
              <button type="button" onClick={clearAll} className="-mr-1 min-h-11 px-1 text-[13px] font-bold text-accent">
                Clear all
              </button>
            )}
          </div>
          <div className="divide-y divide-black/[.07] overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:divide-white/10 dark:border-white/10">
            {g.items.map((n) => {
              const Icon = iconFor(n.message);
              const unread = !n.read_at;
              return (
                <div key={n.id} data-note className="flex min-h-[60px] items-center gap-3 overflow-hidden py-2.5 pl-3.5 pr-1.5">
                  <span
                    aria-hidden
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                      unread ? 'bg-[#1d1d1b] text-[#5fd6d6] dark:bg-zinc-100 dark:text-[#0e6266]' : 'bg-accent-soft text-accent'
                    }`}
                  >
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-black dark:text-zinc-50">{n.message}</p>
                    <p className="text-[13px] text-zinc-500 dark:text-zinc-400">{relativeAgo(n.created_at)}</p>
                  </div>
                  {unread && <span role="img" aria-label="Unread" className="h-2.5 w-2.5 shrink-0 rounded-full bg-accent" />}
                  {!readOnly && (
                    <button
                      type="button"
                      aria-label="Clear notification"
                      onClick={(e) => clearOne(n.id, e.currentTarget.closest('[data-note]'))}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-zinc-400 hover:bg-black/5 hover:text-black dark:hover:bg-white/10 dark:hover:text-zinc-100"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
