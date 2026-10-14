'use client';

import { useState, useSyncExternalStore } from 'react';
import { CalendarDays, X } from 'lucide-react';
import type { EventWithSignup } from '@/lib/data/types';

const key = (id: string) => `bp-event-banner-dismissed-${id}`;

// A card at the top of Home for the next gym event. Closing it hides that event on this device only.
export function EventBanner({ event, onOpen }: { event: EventWithSignup; onOpen: () => void }) {
  const [closed, setClosed] = useState(false);
  // Server render and first paint treat it as dismissed, so a dismissed banner never flashes.
  const dismissedBefore = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return localStorage.getItem(key(event.id)) === '1';
      } catch {
        return false;
      }
    },
    () => true
  );
  const hidden = closed || dismissedBefore;
  if (hidden) return null;

  const start = new Date(event.starts_at);
  const when = start.toLocaleString('en-NZ', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft p-3.5">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <CalendarDays className="h-5 w-5 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate text-sm font-extrabold text-black dark:text-zinc-50">{event.title}</span>
          <span className="block truncate text-xs text-zinc-500">
            {when}
            {event.location ? ` · ${event.location}` : ''}
            {event.signedUp ? ' · You are in' : ''}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label="Dismiss"
        onClick={() => {
          try {
            localStorage.setItem(key(event.id), '1');
          } catch {}
          setClosed(true);
        }}
        className="shrink-0 rounded-full p-1.5 text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
