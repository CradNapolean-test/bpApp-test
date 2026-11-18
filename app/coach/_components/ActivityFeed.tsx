'use client';

import { useMemo, useRef } from 'react';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import Link from 'next/link';
import { Activity } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { ExpandableList } from '@/app/_components/ExpandableList';
import { groupActivity } from '@/lib/utils/activityFeed';
import { formatRelativeTime } from '@/lib/utils/dates';
import type { ActivityEventRow } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

// Cross-client version of ActivityTab.tsx -- the coach dashboard's primary content, matching
// PT Distinction's own dashboard where this feed (not the client roster table) is what a
// coach sees first.
export function ActivityFeed({
  events,
  clients,
  extraNames = {},
}: {
  events: ActivityEventRow[];
  clients: CoachClientRow[];
  // Names for clients who belong to another coach in the gym (the feed is gym-wide).
  extraNames?: Record<string, string>;
}) {
  const nameById = useMemo(
    () => new Map<string, string>([...Object.entries(extraNames), ...clients.map((c): [string, string] => [c.id, c.name ?? c.email])]),
    [clients, extraNames]
  );
  const items = useMemo(() => groupActivity(events).slice(0, 5), [events]);
  // The rows settle in one after another when the dashboard opens (GSAP).
  const root = useRef<HTMLElement>(null);
  useStaggerIn(root, '[data-stagger]', null, 0.3);

  return (
    <section ref={root} className="overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10">
      <h2 className="px-5 pb-3.5 pt-[18px] text-lg font-extrabold text-black sm:px-6 dark:text-zinc-50">Latest activity</h2>
      {items.length === 0 ? (
        <EmptyState icon={Activity} title="Nothing recent" hint="Client activity will show up here as it happens." compact />
      ) : (
        <div className="px-2 pb-2 sm:px-3">
          <ExpandableList
            items={items}
            phoneLimit={5}
            className=""
            itemKey={(item, i) => `${item.clientId}-${i}`}
            render={(item) => {
              const name = nameById.get(item.clientId) ?? 'A client';
              return (
                <Link
                  data-stagger
                  href={`/coach/clients/${item.clientId}`}
                  className="flex min-h-11 items-start gap-3 rounded-xl border-t border-black/[.07] px-3 py-2.5 text-sm hover:bg-black/[.03] dark:border-white/10 dark:hover:bg-white/5"
                >
                  <p className="min-w-0 flex-1 text-zinc-700 dark:text-zinc-300">
                    <span className="font-bold text-black dark:text-zinc-50">{name}</span>{' '}
                    {item.summary.charAt(0).toLowerCase() + item.summary.slice(1)}
                  </p>
                  <span className="shrink-0 text-xs font-semibold text-zinc-500">{formatRelativeTime(item.occurredAt)}</span>
                </Link>
              );
            }}
          />
        </div>
      )}
    </section>
  );
}
