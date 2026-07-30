'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Search } from 'lucide-react';
import type { CoachClientRow } from '@/lib/data/coach';
import type { ClientHealthStatus } from '@/lib/data/coach';

const STATUS_DOT: Record<string, string> = {
  green: 'bg-emerald-500',
  amber: 'bg-amber-500',
  red: 'bg-red-500',
  unmonitored: 'bg-zinc-300 dark:bg-zinc-600',
};

// Sort weight so "needs attention" puts the most-stale clients first.
const STATUS_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, unmonitored: 3 };

export function ClientSidebar({
  clients,
  statuses,
}: {
  clients: CoachClientRow[];
  statuses: ClientHealthStatus[];
}) {
  const [query, setQuery] = useState('');
  const [byAttention, setByAttention] = useState(false);

  const statusById = useMemo(
    () => new Map(statuses.map((s) => [s.clientId, s.status])),
    [statuses]
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? clients.filter(
          (c) => (c.name ?? '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q)
        )
      : clients;
    const sorted = [...filtered];
    if (byAttention) {
      sorted.sort(
        (a, b) =>
          (STATUS_RANK[statusById.get(a.id) ?? 'unmonitored'] ?? 9) -
          (STATUS_RANK[statusById.get(b.id) ?? 'unmonitored'] ?? 9)
      );
    } else {
      sorted.sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
    }
    return sorted;
  }, [clients, query, byAttention, statusById]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search clients"
          className="w-full rounded-md border border-black/10 bg-transparent py-1.5 pl-7 pr-2 text-sm dark:border-white/10"
        />
      </div>

      <button
        onClick={() => setByAttention((v) => !v)}
        className={`w-full rounded-md px-2 py-1 text-left text-xs font-medium transition-colors ${
          byAttention
            ? 'bg-accent-soft text-accent'
            : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
        }`}
      >
        {byAttention ? '✓ Needs attention first' : 'Sort by attention'}
      </button>

      <p className="px-2 text-xs text-zinc-400">
        {visible.length} of {clients.length}
      </p>

      <nav className="max-h-[60vh] space-y-0.5 overflow-y-auto md:max-h-[70vh]">
        {visible.map((client) => {
          const status = statusById.get(client.id) ?? 'unmonitored';
          return (
            <Link
              key={client.id}
              href={`/coach/clients/${client.id}`}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_DOT[status]}`} />
              <span className="truncate">{client.name ?? client.email}</span>
            </Link>
          );
        })}
        {visible.length === 0 && (
          <p className="px-2 py-1.5 text-sm text-zinc-500">No clients match “{query}”.</p>
        )}
      </nav>
    </div>
  );
}
