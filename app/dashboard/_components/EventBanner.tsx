'use client';

import { useState, useSyncExternalStore } from 'react';
import { X } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/dates';
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

  const when = formatDateTime(event.starts_at);
  const starts = new Date(event.starts_at);
  return (
    // A plain card like the others on Home, with the date in a black block (the owner's pick, November 2026).
    <div className="flex items-center gap-1 rounded-[20px] border border-black/[.08] bg-card py-2.5 pl-3 pr-1 dark:border-white/10">
      <button type="button" onClick={onOpen} className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 text-left">
        <span className="flex h-12 w-11 shrink-0 flex-col items-center justify-center gap-[3px] rounded-xl bg-[#1d1d1b] text-white dark:bg-white/10" aria-hidden>
          <span className="text-[10px] font-extrabold uppercase leading-none tracking-[0.1em] text-[#5fd6d6]">
            {starts.toLocaleDateString('en-GB', { month: 'short' })}
          </span>
          <span className="text-[19px] font-extrabold leading-none">{starts.getDate()}</span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-bold leading-tight text-black dark:text-zinc-50">{event.title}</span>
          <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">
            Next event · {when}
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
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
