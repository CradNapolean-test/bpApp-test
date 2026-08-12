'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Avatar } from '@/app/_components/Avatar';
import { StatusBadge } from '@/app/_components/StatusBadge';
import type { ClientHealthBucket, ClientHealthStatus } from '@/lib/data/coach';

const BUCKET_ORDER: Exclude<ClientHealthBucket, 'unmonitored'>[] = ['red', 'amber', 'green'];

// At roster scale a bucket can hold dozens of clients; dumping them all inline buries the
// widget. Show a handful and defer the rest to the sortable client table below.
const PREVIEW_LIMIT = 8;

export function ProgramHealth({ statuses }: { statuses: ClientHealthStatus[] }) {
  const [expanded, setExpanded] = useState<ClientHealthBucket | null>(null);

  const buckets: Record<Exclude<ClientHealthBucket, 'unmonitored'>, ClientHealthStatus[]> = {
    green: [],
    amber: [],
    red: [],
  };
  let unmonitoredCount = 0;
  for (const s of statuses) {
    if (s.status === 'unmonitored') unmonitoredCount += 1;
    else buckets[s.status].push(s);
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Program health</h3>
      <div className="mt-2 divide-y divide-black/5 dark:divide-white/5">
        {BUCKET_ORDER.map((key) => {
          const clients = buckets[key];
          const isOpen = expanded === key;
          return (
            <div key={key}>
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="flex w-full items-center justify-between py-2 text-sm"
              >
                <StatusBadge status={key} />
                <span className="text-zinc-500">{clients.length}</span>
              </button>
              {isOpen && (
                <ul className="pb-2 pl-1 text-sm">
                  {clients.length === 0 && <li className="py-1 text-zinc-500">No clients here.</li>}
                  {clients.slice(0, PREVIEW_LIMIT).map((c) => (
                    <li key={c.clientId} className="py-1">
                      <Link
                        href={`/coach/clients/${c.clientId}`}
                        className="flex items-center gap-2 text-zinc-500 hover:text-black dark:hover:text-zinc-300"
                      >
                        <Avatar name={c.name} size="sm" />
                        <span className="hover:underline">{c.name}</span>
                        <span className="text-zinc-400">
                          · {c.lastActiveDate ? `last active ${c.lastActiveDate}` : 'never logged'}
                        </span>
                      </Link>
                    </li>
                  ))}
                  {clients.length > PREVIEW_LIMIT && (
                    <li className="py-1 text-xs text-zinc-400">
                      +{clients.length - PREVIEW_LIMIT} more — see the full list below.
                    </li>
                  )}
                </ul>
              )}
            </div>
          );
        })}
      </div>
      {unmonitoredCount > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          {unmonitoredCount} client{unmonitoredCount === 1 ? '' : 's'} not monitored (reminders off).
        </p>
      )}
    </div>
  );
}
