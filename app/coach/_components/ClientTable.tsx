'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpDown, Search, Users } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { GroupsManager } from './GroupsManager';
import type { ClientHealthBucket, ClientHealthStatus, CoachClientRow } from '@/lib/data/coach';
import type { ClientGroupWithMembers } from '@/lib/data/types';

type SortKey = 'name' | 'lastActive' | 'status' | 'credits';

const STATUS_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, unmonitored: 3 };

// Plain color-word text for this table specifically (matches the desktop clients table design)
// -- distinct from StatusBadge's pill+label treatment used in Program Health / client detail,
// which needs the fuller "Action required"/"Keep watch" phrasing since it stands alone there.
const STATUS_TEXT: Record<ClientHealthBucket, { label: string; cls: string }> = {
  red: { label: 'Red', cls: 'text-red-600 dark:text-red-400' },
  amber: { label: 'Amber', cls: 'text-amber-600 dark:text-amber-400' },
  green: { label: 'Green', cls: 'text-emerald-600 dark:text-emerald-400' },
  unmonitored: { label: 'Unmonitored', cls: 'text-zinc-400' },
};

export function ClientTable({
  clients,
  statuses,
  groups,
}: {
  clients: CoachClientRow[];
  statuses: ClientHealthStatus[];
  groups: ClientGroupWithMembers[];
}) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [managingGroups, setManagingGroups] = useState(false);
  const [pendingDeletionOnly, setPendingDeletionOnly] = useState(false);

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.clientId, s])), [statuses]);
  const pendingDeletionCount = useMemo(() => clients.filter((c) => c.deletion_requested_at != null).length, [clients]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeGroup = groupId ? groups.find((g) => g.id === groupId) : null;
    const filteredClients = clients
      .filter((c) => (q ? (c.name ?? '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q) : true))
      .filter((c) => (activeGroup ? activeGroup.memberIds.includes(c.id) : true))
      .filter((c) => (pendingDeletionOnly ? c.deletion_requested_at != null : true));
    const merged = filteredClients.map((c) => ({ client: c, health: statusById.get(c.id) ?? null }));
    merged.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.client.name ?? a.client.email).localeCompare(b.client.name ?? b.client.email);
      } else if (sortKey === 'credits') {
        cmp = a.client.balance - b.client.balance;
      } else if (sortKey === 'status') {
        cmp =
          (STATUS_RANK[a.health?.status ?? 'unmonitored'] ?? 9) -
          (STATUS_RANK[b.health?.status ?? 'unmonitored'] ?? 9);
      } else {
        // Never-logged sorts as most stale rather than silently landing at one end.
        cmp = (b.health?.daysSinceActive ?? Infinity) - (a.health?.daysSinceActive ?? Infinity);
      }
      return asc ? cmp : -cmp;
    });
    return merged;
  }, [clients, statusById, sortKey, asc, query, groupId, groups, pendingDeletionOnly]);

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  if (clients.length === 0) {
    return (
      <div className="rounded-2xl border border-black/10 p-8 text-center dark:border-white/10">
        <Users className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
        <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">No clients yet</p>
        <p className="mt-1 text-sm text-zinc-500">Add your first client above to get started.</p>
      </div>
    );
  }

  const headerCls = 'p-3 text-left font-medium';
  const sortBtn = 'inline-flex items-center gap-1 hover:text-black dark:hover:text-zinc-300';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative sm:max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className="w-full rounded-md border border-black/10 bg-transparent py-1.5 pl-8 pr-2 text-sm dark:border-white/10"
          />
        </div>
        <select
          value={groupId}
          onChange={(e) => setGroupId(e.target.value)}
          className="rounded-md border border-black/10 bg-transparent py-1.5 px-2 text-sm dark:border-white/10"
        >
          <option value="">All clients</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        <button
          onClick={() => setManagingGroups(true)}
          className="rounded-md border border-black/10 px-2.5 py-1.5 text-xs font-medium hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
        >
          Manage groups
        </button>
        {pendingDeletionCount > 0 && (
          <button
            onClick={() => setPendingDeletionOnly((v) => !v)}
            className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium ${
              pendingDeletionOnly
                ? 'border-danger/30 bg-danger/10 text-danger'
                : 'border-black/10 hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Pending deletion ({pendingDeletionCount})
          </button>
        )}
      </div>
      {managingGroups && (
        <GroupsManager groups={groups} clients={clients} onClose={() => setManagingGroups(false)} />
      )}
      <div className="overflow-x-auto rounded-2xl border border-black/10 shadow-sm dark:border-white/10">
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
            return (
              <tr
                key={client.id}
                className="border-b border-black/5 last:border-0 hover:bg-black/[.02] dark:border-white/5 dark:hover:bg-white/[.03]"
              >
                <td className="p-3">
                  <div className="flex items-center gap-2.5">
                    <Avatar name={client.name ?? client.email} size="sm" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/coach/clients/${client.id}`}
                          className="font-medium text-black hover:underline dark:text-zinc-50"
                        >
                          {client.name ?? client.email}
                        </Link>
                        {client.deletion_requested_at && (
                          <span
                            title="Deletion requested"
                            className="inline-flex items-center gap-1 rounded-full bg-danger/10 px-1.5 py-0.5 text-[10px] font-semibold text-danger"
                          >
                            <AlertTriangle className="h-2.5 w-2.5" />
                            Deletion requested
                          </span>
                        )}
                      </div>
                      <p className="truncate text-xs text-zinc-500">{client.email}</p>
                    </div>
                  </div>
                </td>
                <td className="p-3">
                  <span className={`font-semibold ${STATUS_TEXT[health?.status ?? 'unmonitored'].cls}`}>
                    {STATUS_TEXT[health?.status ?? 'unmonitored'].label}
                  </span>
                </td>
                <td className="whitespace-nowrap p-3 text-zinc-500">
                  {health?.lastActiveDate
                    ? health.daysSinceActive === 0
                      ? 'Today'
                      : health.daysSinceActive === 1
                        ? 'Yesterday'
                        : `${health.daysSinceActive}d ago`
                    : 'Never logged'}
                </td>
                <td className="p-3 text-zinc-500">{client.balance}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="p-3 text-center text-zinc-500">
                No clients match &quot;{query}&quot;.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
    </div>
  );
}
