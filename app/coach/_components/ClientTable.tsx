'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowUpDown, Search, Users } from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { GroupsManager } from './GroupsManager';
import { toCsv, downloadTextFile } from '@/lib/utils/csv';
import type { ClientHealthBucket, ClientHealthStatus, CoachClientRow, GymClientRow } from '@/lib/data/coach';
import type { ClientGroupWithMembers } from '@/lib/data/types';

type SortKey = 'name' | 'lastActive' | 'status' | 'credits';
type Scope = 'mine' | 'gym';
type QuickFilter = 'all' | 'review' | 'quiet' | 'credits';

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
  gymClients,
  statuses,
  groups,
}: {
  clients: CoachClientRow[];
  // Every client at the gym, regardless of assigned coach -- only present when this table is
  // used from the main Clients page (search-all-clients toggle). Omitted call sites keep the
  // "my clients" only behavior unchanged.
  gymClients?: GymClientRow[];
  gymName?: string;
  statuses: ClientHealthStatus[];
  groups: ClientGroupWithMembers[];
}) {
  const [scope, setScope] = useState<Scope>('mine');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [managingGroups, setManagingGroups] = useState(false);
  const [pendingDeletionOnly, setPendingDeletionOnly] = useState(false);
  const [quick, setQuick] = useState<QuickFilter>('all');

  const activeClients: (CoachClientRow | GymClientRow)[] = scope === 'gym' && gymClients ? gymClients : clients;

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.clientId, s])), [statuses]);
  const pendingDeletionCount = useMemo(
    () => activeClients.filter((c) => c.deletion_requested_at != null).length,
    [activeClients]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeGroup = groupId ? groups.find((g) => g.id === groupId) : null;
    const filteredClients = activeClients
      .filter((c) => (q ? (c.name ?? '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q) : true))
      .filter((c) => (activeGroup ? activeGroup.memberIds.includes(c.id) : true))
      .filter((c) => (pendingDeletionOnly ? c.deletion_requested_at != null : true));
    const merged = filteredClients
      .map((c) => ({ client: c, health: statusById.get(c.id) ?? null }))
      .filter(({ client, health }) =>
        quick === 'review'
          ? client.needsReview
          : quick === 'quiet'
            ? health?.status === 'red' || health?.status === 'amber'
            : quick === 'credits'
              ? client.balance <= 1 && client.planName != null
              : true
      );
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
  }, [activeClients, statusById, sortKey, asc, query, groupId, groups, pendingDeletionOnly, quick]);

  const quickCounts = useMemo(
    () => ({
      review: activeClients.filter((c) => c.needsReview).length,
      quiet: activeClients.filter((c) => {
        const s = statusById.get(c.id)?.status;
        return s === 'red' || s === 'amber';
      }).length,
      credits: activeClients.filter((c) => c.balance <= 1 && c.planName != null).length,
    }),
    [activeClients, statusById]
  );

  function toggleSort(key: SortKey) {
    if (key === sortKey) setAsc((v) => !v);
    else {
      setSortKey(key);
      setAsc(true);
    }
  }

  // Exports exactly what's on screen -- current search/group/scope filters and sort order --
  // rather than the full unfiltered roster, so "export the amber clients" is just a filter
  // click away instead of a separate flow.
  function handleExport() {
    const csv = toCsv(
      ['Name', 'Email', 'Status', 'Last active', 'Days since active', 'Credits'],
      rows.map(({ client, health }) => [
        client.name ?? '',
        client.email,
        health ? STATUS_TEXT[health.status].label : STATUS_TEXT.unmonitored.label,
        health?.lastActiveDate ?? 'Never logged',
        health?.daysSinceActive ?? '',
        client.balance,
      ])
    );
    downloadTextFile(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
  }

const scopeBtnCls = (active: boolean) =>
  `rounded-full px-4 py-1.5 text-center text-xs font-bold transition-colors ${
    active
      ? 'bg-accent text-accent-foreground'
      : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/5'
  }`;

  if (clients.length === 0 && !gymClients) {
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
      {gymClients && (
        <div className="grid w-full grid-cols-2 gap-1 rounded-full border border-black/10 p-0.5 sm:w-max dark:border-white/10">
          <button onClick={() => setScope('mine')} className={scopeBtnCls(scope === 'mine')}>
            My clients
          </button>
          <button onClick={() => setScope('gym')} className={scopeBtnCls(scope === 'gym')}>
            Whole gym
          </button>
        </div>
      )}
      {scope === 'gym' && activeClients.length === 0 ? (
        <div className="rounded-2xl border border-black/10 p-8 text-center dark:border-white/10">
          <Users className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">No clients at this gym yet</p>
        </div>
      ) : (
      <>
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            className="w-full rounded-xl border border-black/10 bg-transparent py-2 pl-9 pr-3 text-sm dark:border-white/10"
          />
        </div>
        {groups.length > 0 && (
          <select
            value={groupId}
            onChange={(e) => setGroupId(e.target.value)}
            aria-label="Filter by group"
            className="max-w-[8.5rem] rounded-xl border border-black/10 bg-transparent px-2.5 py-2 text-sm dark:border-white/10"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        <DropdownMenu
          variant="header"
          triggerLabel="More client actions"
          items={[
            { label: 'Manage groups', onSelect: () => setManagingGroups(true) },
            { label: 'Export CSV', onSelect: handleExport },
          ]}
        />
      </div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ['all', 'All', activeClients.length],
          ['review', 'New to review', quickCounts.review],
          ['quiet', 'Gone quiet', quickCounts.quiet],
          ['credits', 'Low credits', quickCounts.credits],
        ] as [QuickFilter, string, number][]).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            onClick={() => setQuick(key)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              quick === key ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
            }`}
          >
            {label}
            {key !== 'all' && count > 0 ? ` · ${count}` : ''}
          </button>
        ))}
      </div>
      {pendingDeletionCount > 0 && (
        <button
          onClick={() => setPendingDeletionOnly((v) => !v)}
          className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-bold ${
            pendingDeletionOnly
              ? 'border-danger/30 bg-danger/10 text-danger'
              : 'border-black/10 text-zinc-600 hover:bg-black/5 dark:border-white/10 dark:text-zinc-300 dark:hover:bg-white/5'
          }`}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
          Pending deletion ({pendingDeletionCount})
        </button>
      )}
      {managingGroups && (
        <GroupsManager groups={groups} clients={clients} onClose={() => setManagingGroups(false)} />
      )}
      {/* Phone: one card per client (the table needs ~34rem of width). */}
      <ul className="space-y-2 md:hidden">
        {rows.map(({ client, health }) => {
          const status = STATUS_TEXT[health?.status ?? 'unmonitored'];
          const last = health?.lastActiveDate
            ? health.daysSinceActive === 0
              ? 'Active today'
              : health.daysSinceActive === 1
                ? 'Active yesterday'
                : `Active ${health.daysSinceActive}d ago`
            : 'Never logged';
          return (
            <li key={client.id}>
              <Link
                href={`/coach/clients/${client.id}`}
                className="flex items-center gap-3 rounded-2xl border border-black/[.06] bg-card p-3 dark:border-white/10"
              >
                <Avatar name={client.name ?? client.email} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-black dark:text-zinc-50">
                    <span className="truncate">{client.name ?? client.email}</span>
                    {client.needsReview && <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>}
                    {client.deletion_requested_at && <span className="shrink-0 rounded-full bg-danger/15 px-1.5 py-0.5 text-[10px] font-extrabold text-danger">DELETE</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    <span className={`font-semibold ${status.cls}`}>{status.label}</span> · {last}
                    {client.planName ? ` · ${client.planName}` : ' · No plan'}
                    {'coachName' in client && !client.isOwnClient ? ` · ${client.coachName}` : ''}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-black dark:text-zinc-50">{client.balance}</p>
                  <p className="text-[11px] text-zinc-500">credits</p>
                </div>
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="p-3 text-center text-sm text-zinc-500">No clients match &quot;{query}&quot;.</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-2xl border border-black/10 shadow-sm md:block dark:border-white/10">
        <table className="w-full min-w-[34rem] text-sm">
        <thead>
          <tr className="border-b border-black/10 text-zinc-500 dark:border-white/10">
            <th className={headerCls}>
              <button onClick={() => toggleSort('name')} className={sortBtn}>
                Client <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            {scope === 'gym' && <th className={headerCls}>Coach</th>}
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
                        {client.needsReview && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>
                        )}
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
                      <p className="truncate text-xs text-zinc-500">{client.planName ?? 'No plan'} · {client.email}</p>
                    </div>
                  </div>
                </td>
                {scope === 'gym' && (
                  <td className="p-3 text-zinc-500">
                    {'coachName' in client ? (client.isOwnClient ? 'You' : client.coachName) : ''}
                  </td>
                )}
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
              <td colSpan={scope === 'gym' ? 5 : 4} className="p-3 text-center text-zinc-500">
                No clients match &quot;{query}&quot;.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      </>
      )}
    </div>
  );
}
