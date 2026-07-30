'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, Users } from 'lucide-react';
import type { ClientHealthStatus, CoachClientRow } from '@/lib/data/coach';

type SortKey = 'name' | 'lastActive' | 'status' | 'credits';

const STATUS_META: Record<string, { dot: string; label: string; rank: number }> = {
  red: { dot: 'bg-red-500', label: 'Action required', rank: 0 },
  amber: { dot: 'bg-amber-500', label: 'Keep watch', rank: 1 },
  green: { dot: 'bg-emerald-500', label: 'Running okay', rank: 2 },
  unmonitored: { dot: 'bg-zinc-300 dark:bg-zinc-600', label: 'Not monitored', rank: 3 },
};

export function ClientTable({
  clients,
  statuses,
}: {
  clients: CoachClientRow[];
  statuses: ClientHealthStatus[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.clientId, s])), [statuses]);

  const rows = useMemo(() => {
    const merged = clients.map((c) => ({ client: c, health: statusById.get(c.id) ?? null }));
    merged.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.client.name ?? a.client.email).localeCompare(b.client.name ?? b.client.email);
      } else if (sortKey === 'credits') {
        cmp = a.client.balance - b.client.balance;
      } else if (sortKey === 'status') {
        cmp =
          (STATUS_META[a.health?.status ?? 'unmonitored']?.rank ?? 9) -
          (STATUS_META[b.health?.status ?? 'unmonitored']?.rank ?? 9);
      } else {
        // Never-logged sorts as most stale rather than silently landing at one end.
        cmp = (b.health?.daysSinceActive ?? Infinity) - (a.health?.daysSinceActive ?? Infinity);
      }
      return asc ? cmp : -cmp;
    });
    return merged;
  }, [clients, statusById, sortKey, asc]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-lg border border-black/10 p-8 text-center dark:border-white/10">
        <Users className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
        <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">No clients yet</p>
        <p className="mt-1 text-sm text-zinc-500">Add your first client above to get started.</p>
      </div>
    );
  }

  const headerCls = 'p-3 text-left font-medium';
  const sortBtn = 'inline-flex items-center gap-1 hover:text-black dark:hover:text-zinc-300';

  return (
    <div className="overflow-x-auto rounded-lg border border-black/10 dark:border-white/10">
      <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10">
            <th className={headerCls}>
              <button onClick={() => toggleSort('name')} className={sortBtn}>
                Client <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className={headerCls}>
              <button onClick={() => toggleSort('status')} className={sortBtn}>
                Status <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className={headerCls}>
              <button onClick={() => toggleSort('lastActive')} className={sortBtn}>
                Last active <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className={headerCls}>
              <button onClick={() => toggleSort('credits')} className={sortBtn}>
                Credits <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ client, health }) => {
            const meta = STATUS_META[health?.status ?? 'unmonitored'];
            return (
              <tr
                key={client.id}
                className="border-b border-black/5 last:border-0 hover:bg-black/[.02] dark:border-white/5 dark:hover:bg-white/[.03]"
              >
                <td className="p-3">
                  <Link
                    href={`/coach/clients/${client.id}`}
                    className="font-medium text-black hover:underline dark:text-zinc-50"
                  >
                    {client.name ?? client.email}
                  </Link>
                  <p className="truncate text-xs text-zinc-500">{client.email}</p>
                </td>
                <td className="p-3">
                  <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-zinc-500">
                    <span className={`h-2 w-2 rounded-full ${meta.dot}`} />
                    {meta.label}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3 text-zinc-500">
                  {health?.lastActiveDate
                    ? `${health.daysSinceActive}d ago`
                    : 'Never logged'}
                </td>
                <td className="p-3 text-zinc-500">{client.balance}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
