'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { ClientHealthBucket, ClientHealthStatus } from '@/lib/data/coach';

const BUCKET_META: Record<Exclude<ClientHealthBucket, 'unmonitored'>, { label: string; dot: string }> = {
  green: { label: 'Running okay', dot: 'bg-emerald-500' },
  amber: { label: 'Keep watch', dot: 'bg-amber-500' },
  red: { label: 'Action required', dot: 'bg-red-500' },
};

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
    <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
      <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Program health</h3>
      <div className="mt-2 divide-y divide-black/5 dark:divide-white/5">
        {BUCKET_ORDER.map((key) => {
          const meta = BUCKET_META[key];
          const clients = buckets[key];
          const isOpen = expanded === key;
          return (
            <div key={key}>
              <button
                onClick={() => setExpanded(isOpen ? null : key)}
                className="flex w-full items-center justify-between py-2 text-sm"
              >
                <span className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                  {meta.label}
                </span>
                <span className="text-zinc-500">{clients.length}</span>
              </button>
              {isOpen && (
                <ul className="pb-2 pl-5 text-sm">
                  {clients.length === 0 && <li className="py-1 text-zinc-500">No clients here.</li>}
                  {clients.slice(0, PREVIEW_LIMIT).map((c) => (
                    <li key={c.clientId} className="py-1">
                      <Link
                        href={`/coach/clients/${c.clientId}`}
                        className="text-zinc-500 hover:text-black hover:underline dark:hover:text-zinc-300"
                      >
                        {c.name}{' '}
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
