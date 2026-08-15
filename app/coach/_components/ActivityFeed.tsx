'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { groupActivity } from '@/lib/utils/activityFeed';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { ActivityEventRow } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

// Cross-client version of ActivityTab.tsx -- the coach dashboard's primary content, matching
// PT Distinction's own dashboard where this feed (not the client roster table) is what a
// coach sees first.
export function ActivityFeed({ events, clients }: { events: ActivityEventRow[]; clients: CoachClientRow[] }) {
  const nameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name ?? c.email])), [clients]);
  const items = useMemo(() => groupActivity(events).slice(0, 20), [events]);

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <h3 className="font-bold text-black dark:text-zinc-50">Recent activity</h3>
      {items.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recent" hint="Client activity will show up here as it happens." compact />
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((item, i) => {
            const name = nameById.get(item.clientId) ?? 'A client';
            return (
              <li key={i}>
                <Link
                  href={`/coach/clients/${item.clientId}`}
                  className="flex items-start gap-2 rounded-lg py-0.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-black dark:bg-zinc-50" />
                  <p className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">
                    <span className="font-bold text-black dark:text-zinc-50">{name}</span>{' '}
                    {item.summary.charAt(0).toLowerCase() + item.summary.slice(1)}
                  </p>
                  <span className="shrink-0 text-xs text-zinc-400">{formatRelativeTime(item.occurredAt)}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
