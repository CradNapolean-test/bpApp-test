'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Activity, Apple, Camera, CalendarDays, CheckSquare, Dumbbell, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { groupActivity } from '@/lib/utils/activityFeed';
import type { ActivityEventRow } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

const TYPE_ICON: Record<ActivityEventRow['event_type'], LucideIcon> = {
  measurement: TrendingUp,
  habit: CheckSquare,
  workout: Dumbbell,
  photo: Camera,
  booking: CalendarDays,
  food: Apple,
};

// Cross-client version of ActivityTab.tsx -- the coach dashboard's primary content, matching
// PT Distinction's own dashboard where this feed (not the client roster table) is what a
// coach sees first.
export function ActivityFeed({ events, clients }: { events: ActivityEventRow[]; clients: CoachClientRow[] }) {
  const nameById = useMemo(() => new Map(clients.map((c) => [c.id, c.name ?? c.email])), [clients]);
  const items = useMemo(() => groupActivity(events).slice(0, 20), [events]);

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Client activity</h3>
      {items.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recent" hint="Client activity will show up here as it happens." compact />
      ) : (
        <div className="mt-2 space-y-1.5">
          {items.map((item, i) => {
            const Icon = TYPE_ICON[item.type];
            const name = nameById.get(item.clientId) ?? 'A client';
            return (
              <Link
                key={i}
                href={`/coach/clients/${item.clientId}`}
                className="flex items-center gap-2.5 rounded-lg p-1.5 text-sm hover:bg-black/5 dark:hover:bg-white/5"
              >
                <Avatar name={name} size="sm" />
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-black/5 dark:bg-white/10">
                  <Icon className="h-3.5 w-3.5 text-zinc-600 dark:text-zinc-300" />
                </span>
                <p className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-300">
                  <span className="font-medium text-black dark:text-zinc-50">{name}</span>{' '}
                  {item.summary.charAt(0).toLowerCase() + item.summary.slice(1)}
                </p>
                <span className="shrink-0 text-xs text-zinc-400">{new Date(item.occurredAt).toLocaleDateString()}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
