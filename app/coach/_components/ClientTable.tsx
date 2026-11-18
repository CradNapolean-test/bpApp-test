'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, MessageSquare, Search, Users } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { Avatar } from '@/app/_components/Avatar';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { GroupsManager } from './GroupsManager';
import { useSlidingThumb } from '@/app/_components/motion/useSlidingThumb';
import { useFlipList } from '@/app/_components/motion/useFlipList';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { toCsv, downloadTextFile } from '@/lib/utils/csv';
import { LIST_STEP, remainingAfter, showMore, visibleCount } from '@/lib/paging';
import { QUIET_DAYS, SLIPPING_DAYS, hasReason, type FollowUp, type FollowUpKind } from '@/lib/followUp';
import type { ClientHealthBucket, ClientHealthStatus, CoachClientRow, GymClientRow } from '@/lib/data/coach';
import type { ClientGroupWithMembers } from '@/lib/data/types';

type SortKey = 'name' | 'lastActive' | 'status' | 'credits';
type Scope = 'mine' | 'gym';
export type QuickFilter = 'all' | 'review' | 'check' | 'quiet' | 'credits' | 'noplan';

const STATUS_RANK: Record<string, number> = { red: 0, amber: 1, green: 2, unmonitored: 3, notsetup: 3 };

// Reason chips, as on the dashboard's "Members to check in on".
const REASON_CLS: Record<FollowUpKind, string> = {
  quiet: 'bg-danger/15 text-danger',
  classes: 'bg-danger/15 text-danger',
  missed: 'bg-warning/15 text-warning',
  credits: 'bg-warning/15 text-warning',
  stalled: 'bg-accent/15 text-accent',
};
const NOT_SET_UP = { label: 'Not set up', cls: 'text-zinc-400' };
// The same words and colours as pills on the wide table (the board's Status column).
const PILL: Record<string, string> = {
  Red: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300',
  Amber: 'bg-amber-100 text-amber-800 dark:bg-amber-400/15 dark:text-amber-300',
  Green: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-300',
  'On hold': 'bg-sky-100 text-sky-800 dark:bg-sky-500/15 dark:text-sky-300',
};
const pillCls = (label: string) => PILL[label] ?? 'bg-black/[.06] text-zinc-600 dark:bg-white/10 dark:text-zinc-300';

// The Logging column (D10): how recently the member logged anything, as a colour word. It measures logging only, not attendance or
// progress, hence the name (it was "Status", CL5). The bands are lib/followUp.ts's: red is exactly "Gone quiet" (D11).
const STATUS_TEXT: Record<ClientHealthBucket, { label: string; cls: string }> = {
  red: { label: 'Red', cls: 'text-red-600 dark:text-red-400' },
  amber: { label: 'Amber', cls: 'text-amber-600 dark:text-amber-400' },
  green: { label: 'Green', cls: 'text-emerald-600 dark:text-emerald-400' },
  unmonitored: { label: 'Not monitored', cls: 'text-zinc-400' },
};

export function ClientTable({
  clients,
  gymClients,
  gymName,
  statuses,
  groups,
  holdIds = [],
  unreadByClient = {},
  initialPlan = '',
  initialScope = 'mine',
  initialQuick = 'all',
  followUps = {},
  notSetUpIds = [],
}: {
  clients: CoachClientRow[];
  // Every client at the gym, regardless of assigned coach -- only present when this table is
  // used from the main Clients page (search-all-clients toggle). Omitted call sites keep the
  // "my clients" only behavior unchanged.
  gymClients?: GymClientRow[];
  gymName?: string;
  statuses: ClientHealthStatus[];
  groups: ClientGroupWithMembers[];
  // Members whose membership is on hold today, and unread message counts by member.
  holdIds?: string[];
  unreadByClient?: Record<string, number>;
  // Opened from a plan's member count: start on that plan, across the whole gym.
  initialPlan?: string;
  initialScope?: Scope;
  // Opened from the dashboard's "Members to check in on": start on that filter.
  initialQuick?: QuickFilter;
  // The follow-up list (lib/followUp.ts) by member: the same members and reasons as the dashboard's "Members to check in on" (CL16).
  followUps?: Record<string, FollowUp>;
  // Members who have not finished setting up the app.
  notSetUpIds?: string[];
}) {
  const [scope, setScope] = useState<Scope>(initialScope);
  const [planFilter, setPlanFilter] = useState(initialPlan);
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [asc, setAsc] = useState(true);
  const [query, setQuery] = useState('');
  const [groupId, setGroupId] = useState('');
  const [managingGroups, setManagingGroups] = useState(false);
  const [quick, setQuick] = useState<QuickFilter>(initialQuick);
  const [legend, setLegend] = useState(false);
  // Motion (GSAP): the My members / Whole gym highlight slides; the rows settle in when the list first shows and when the scope changes;
  // and when a filter or the sort changes, the rows that stay glide to their new places (Flip), so the coach sees what moved.
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeTrack = useRef<HTMLDivElement>(null);
  useSlidingThumb(scopeTrack, scope);
  useStaggerIn(rootRef, '[data-flip-id]', scope);
  const captureFlip = useFlipList(rootRef, `${quick}|${planFilter}|${groupId}|${sortKey}|${asc}`);
  const onHold = useMemo(() => new Set(holdIds), [holdIds]);
  const notSetUp = useMemo(() => new Set(notSetUpIds), [notSetUpIds]);

  const activeClients: (CoachClientRow | GymClientRow)[] = scope === 'gym' && gymClients ? gymClients : clients;

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.clientId, s])), [statuses]);

  // The quick filters. Check in on, Gone quiet and Out of credits are the dashboard's follow-up reasons (members on hold have none); Out
  // of credits replaces "Low credits", which listed plan members who had simply booked their week (CL19, RO5).
  const inQuick = useCallback(
    (key: QuickFilter, c: CoachClientRow): boolean => {
      const f = followUps[c.id];
      if (key === 'review') return c.needsReview;
      if (key === 'check') return !!f;
      if (key === 'quiet') return hasReason(f, 'quiet');
      if (key === 'credits') return hasReason(f, 'credits');
      if (key === 'noplan') return c.planName == null;
      return true;
    },
    [followUps]
  );

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const activeGroup = groupId ? groups.find((g) => g.id === groupId) : null;
    const filteredClients = activeClients
      .filter((c) => (q ? (c.name ?? '').toLowerCase().includes(q) || c.email.toLowerCase().includes(q) : true))
      .filter((c) => (activeGroup ? activeGroup.memberIds.includes(c.id) : true))
      .filter((c) => (planFilter ? (planFilter === '__none' ? c.planName == null : c.planName === planFilter) : true));
    const merged = filteredClients
      .map((c) => ({ client: c, health: statusById.get(c.id) ?? null }))
      .filter(({ client }) => inQuick(quick, client));
    merged.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.client.name ?? a.client.email).localeCompare(b.client.name ?? b.client.email);
      } else if (sortKey === 'credits') {
        cmp = a.client.balance - b.client.balance;
      } else if (sortKey === 'status') {
        const rank = (r: typeof a) => (notSetUp.has(r.client.id) ? STATUS_RANK.notsetup : (STATUS_RANK[r.health?.status ?? 'unmonitored'] ?? 9));
        cmp = rank(a) - rank(b);
      } else {
        // Never-logged sorts as most stale rather than silently landing at one end.
        cmp = (b.health?.daysSinceActive ?? Infinity) - (a.health?.daysSinceActive ?? Infinity);
      }
      return asc ? cmp : -cmp;
    });
    return merged;
  }, [activeClients, statusById, sortKey, asc, query, groupId, groups, quick, planFilter, inQuick, notSetUp]);

  // Every count comes from the same follow-up list as the dashboard, for whichever of My clients / Whole gym is showing.
  const quickCounts = useMemo(
    () => ({
      review: activeClients.filter((c) => inQuick('review', c)).length,
      check: activeClients.filter((c) => inQuick('check', c)).length,
      quiet: activeClients.filter((c) => inQuick('quiet', c)).length,
      credits: activeClients.filter((c) => inQuick('credits', c)).length,
      noplan: activeClients.filter((c) => inQuick('noplan', c)).length,
    }),
    [activeClients, inQuick]
  );

  const planNames = useMemo(() => [...new Set(activeClients.map((c) => c.planName).filter((n): n is string => !!n))].sort(), [activeClients]);
  const filtersOn = query.trim() !== '' || groupId !== '' || quick !== 'all' || planFilter !== '';
  // Long lists draw the first few and a "Show more" button (90 members were ~2,900 elements). The count starts over whenever the
  // list, the filters or the sort change, so a new search never opens halfway down.
  const listKey = `${scope}|${query}|${groupId}|${quick}|${planFilter}|${sortKey}|${asc}`;
  const [paging, setPaging] = useState({ key: '', count: LIST_STEP });
  const shownCount = visibleCount(rows.length, paging.key === listKey ? paging.count : LIST_STEP);
  const shownRows = rows.slice(0, shownCount);
  const moreRows = remainingAfter(rows.length, shownCount);
  function clearFilters() {
    captureFlip();
    setQuery('');
    setGroupId('');
    setQuick('all');
    setPlanFilter('');
  }
  const emptyText = filtersOn ? 'Nobody matches these filters.' : 'No clients here yet.';
  const whose =
    scope === 'gym' && gymClients
      ? `member${activeClients.length === 1 ? '' : 's'} at ${gymName ?? 'the gym'}`
      : `of your member${activeClients.length === 1 ? '' : 's'}`;
  // Red only when they are out of credits with nothing booked (the Out of credits reason). A plan member at 0 who has booked their week is
  // fine (CL19); 0 with nothing to act on is grey.
  const creditCls = (c: CoachClientRow) =>
    hasReason(followUps[c.id], 'credits') ? 'text-danger' : c.balance <= 0 ? 'text-zinc-500' : 'text-black dark:text-zinc-50';
  const statusFor = (id: string, health: ClientHealthStatus | null) =>
    onHold.has(id) ? { label: 'On hold', cls: 'text-sky-600 dark:text-sky-400' } : notSetUp.has(id) ? NOT_SET_UP : STATUS_TEXT[health?.status ?? 'unmonitored'];
  // Why each member on Check in on is there, under their name.
  const reasonChips = (id: string) =>
    quick === 'check' && followUps[id] ? (
      <span className="mt-1 flex flex-wrap gap-1">
        {followUps[id].reasons.map((r) => (
          <span key={r.kind} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${REASON_CLS[r.kind]}`}>
            {r.label}
          </span>
        ))}
      </span>
    ) : null;

  function toggleSort(key: SortKey) {
    captureFlip();
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
      ['Name', 'Email', 'Logging', 'Last active', 'Days since active', 'Credits', 'Check in on'],
      rows.map(({ client, health }) => [
        client.name ?? '',
        client.email,
        statusFor(client.id, health).label,
        health?.lastActiveDate ?? 'Never logged',
        health?.daysSinceActive ?? '',
        client.balance,
        followUps[client.id]?.reasons.map((r) => r.label).join('; ') ?? '',
      ])
    );
    downloadTextFile(`clients-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
  }

const scopeBtnCls = (active: boolean) =>
  `relative min-h-9 rounded-lg px-3.5 text-center text-sm font-bold transition-colors ${
    active ? 'bg-card text-black shadow-sm dark:text-zinc-50' : 'text-zinc-600 hover:text-black dark:text-zinc-300'
  }`;

  if (clients.length === 0 && !gymClients) {
    return (
      <div className="rounded-[20px] border border-black/[.08] bg-card p-8 text-center dark:border-white/10">
        <Users className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
        <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">No clients yet</p>
        <p className="mt-1 text-sm text-zinc-500">Add your first client above to get started.</p>
      </div>
    );
  }

  const headerCls = 'px-4 py-3 text-left font-bold first:pl-6';
  const sortBtn = 'inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-black dark:hover:text-zinc-300';

  return (
    <div ref={rootRef} className="space-y-3">
      {gymClients && (
        <div ref={scopeTrack} role="group" aria-label="Whose clients" className="relative grid w-full grid-cols-2 gap-1 rounded-xl bg-black/[.06] p-1 sm:w-max dark:bg-white/10">
          <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
          <button type="button" aria-pressed={scope === 'mine'} data-active={scope === 'mine'} onClick={() => setScope('mine')} className={scopeBtnCls(scope === 'mine')}>
            My members
          </button>
          <button type="button" aria-pressed={scope === 'gym'} data-active={scope === 'gym'} onClick={() => setScope('gym')} className={scopeBtnCls(scope === 'gym')}>
            Whole gym
          </button>
        </div>
      )}
      {scope === 'gym' && activeClients.length === 0 ? (
        <div className="rounded-[20px] border border-black/[.08] bg-card p-8 text-center dark:border-white/10">
          <Users className="mx-auto h-8 w-8 text-zinc-300 dark:text-zinc-600" />
          <p className="mt-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">No clients at {gymName ?? 'this gym'} yet</p>
        </div>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients"
            aria-label="Search clients"
            className="h-11 w-full rounded-xl border border-black/[.16] bg-card pl-9 pr-3 text-[15px] dark:border-white/15"
          />
        </div>
        {groups.length > 0 && (
          <select
            value={groupId}
            onChange={(e) => {
              captureFlip();
              setGroupId(e.target.value);
            }}
            aria-label="Filter by group"
            className="h-11 max-w-[10rem] rounded-full border border-black/[.14] bg-card px-4 text-sm font-bold dark:border-white/15"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
        )}
        {planNames.length > 0 && (
          <select
            value={planFilter}
            onChange={(e) => {
              captureFlip();
              setPlanFilter(e.target.value);
            }}
            aria-label="Filter by plan"
            className="h-11 max-w-[10rem] rounded-full border border-black/[.14] bg-card px-4 text-sm font-bold dark:border-white/15"
          >
            <option value="">All plans</option>
            {planNames.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value="__none">No plan</option>
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
      <div role="group" aria-label="Quick filters" className="flex gap-1.5 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {([
          ['all', 'All', activeClients.length],
          ['review', 'New to review', quickCounts.review],
          ['check', 'Check in on', quickCounts.check],
          ['quiet', 'Gone quiet', quickCounts.quiet],
          ['credits', 'Out of credits', quickCounts.credits],
          ['noplan', 'No plan', quickCounts.noplan],
        ] as [QuickFilter, string, number][]).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            aria-pressed={quick === key}
            onClick={() => {
              captureFlip();
              setQuick(key);
            }}
            className={`h-11 shrink-0 rounded-full px-4 text-sm font-bold ${
              quick === key
                ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
                : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
            }`}
          >
            {label}
            {count > 0 ? <span className={quick === key ? 'ml-1.5 opacity-70' : 'ml-1.5 text-zinc-500'}>{count}</span> : null}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 px-1">
        <p className="text-sm text-zinc-500">
          {/* Says whose members the list and the counts above are for: they change with My clients / Whole gym (CL16). */}
          {rows.length === activeClients.length ? `${rows.length} ${whose}` : `Showing ${rows.length} of ${activeClients.length} ${whose}`}
          {filtersOn && (
            <button type="button" onClick={clearFilters} className="ml-2 font-bold text-accent">
              Clear filters
            </button>
          )}
        </p>
        <div className="flex items-center gap-2">
          <select
            aria-label="Sort by"
            value={sortKey}
            onChange={(e) => {
              captureFlip();
              setSortKey(e.target.value as SortKey);
              setAsc(true);
            }}
            className="h-11 rounded-full border border-black/[.14] bg-card px-4 text-sm font-bold dark:border-white/15"
          >
            <option value="name">Name A–Z</option>
            <option value="lastActive">Most inactive first</option>
            <option value="status">Logging, red first</option>
            <option value="credits">Fewest credits first</option>
          </select>
          <button type="button" onClick={() => setLegend(true)} className="min-h-11 shrink-0 px-1 text-sm font-bold text-accent">
            Colour key
          </button>
        </div>
      </div>
      {managingGroups && (
        <GroupsManager groups={groups} clients={clients} onClose={() => setManagingGroups(false)} />
      )}
      {/* Phone: one card per client (the table needs ~34rem of width). */}
      <ul className="divide-y divide-black/[.07] overflow-hidden rounded-[20px] border border-black/[.08] bg-card md:hidden dark:divide-white/10 dark:border-white/10">
        {shownRows.map(({ client, health }) => {
          const status = statusFor(client.id, health);
          const unread = unreadByClient[client.id] ?? 0;
          const last = health?.lastActiveDate
            ? health.daysSinceActive === 0
              ? 'Active today'
              : health.daysSinceActive === 1
                ? 'Active yesterday'
                : `Active ${health.daysSinceActive}d ago`
            : 'Never logged';
          return (
            <li key={client.id} data-flip-id={client.id} className="flex items-stretch">
              <Link href={`/coach/clients/${client.id}`} className="flex min-w-0 flex-1 items-center gap-3 p-3">
                <Avatar name={client.name ?? client.email} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate font-semibold text-black dark:text-zinc-50">
                    <span className="truncate">{client.name ?? client.email}</span>
                    {client.needsReview && <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>}
                    {onHold.has(client.id) && <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">HOLD</span>}
                  </p>
                  <p className="truncate text-xs text-zinc-500">
                    <span className={`font-semibold ${status.cls}`}>{status.label}</span> · {last}
                    {client.planName ? ` · ${client.planName}` : ' · No plan'}
                    {'coachName' in client && !client.isOwnClient ? ` · ${client.coachName}` : ''}
                  </p>
                  {reasonChips(client.id)}
                </div>
                <div className="shrink-0 text-right">
                  <p className={`text-sm font-bold ${creditCls(client)}`}>{client.balance}</p>
                  <p className="text-[11px] text-zinc-500">credits</p>
                </div>
              </Link>
              <Link
                href={`/coach/clients/${client.id}?open=messages`}
                aria-label={unread > 0 ? `Message ${client.name ?? client.email} (${unread} unread)` : `Message ${client.name ?? client.email}`}
                className="relative my-2 mr-2 flex w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
              >
                <MessageSquare className="h-5 w-5" />
                {unread > 0 && <span className="absolute right-2.5 top-3 h-2.5 w-2.5 rounded-full bg-accent" />}
              </Link>
            </li>
          );
        })}
        {rows.length === 0 && <li className="p-3 text-center text-sm text-zinc-500">{emptyText}</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-[20px] border border-black/[.08] bg-card md:block dark:border-white/10">
        <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            <th className={headerCls}>
              <button onClick={() => toggleSort('name')} className={sortBtn}>
                Client <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            {scope === 'gym' && <th className={headerCls}>Coach</th>}
            <th className={headerCls}>
              <button onClick={() => toggleSort('status')} className={sortBtn}>
                Logging <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className={headerCls}>Plan</th>
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
            <th className={headerCls}>
              <span className="sr-only">Message</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {shownRows.map(({ client, health }) => {
            return (
              <tr
                key={client.id}
                data-flip-id={client.id}
                className="border-t border-black/[.07] hover:bg-black/[.02] dark:border-white/10 dark:hover:bg-white/[.03]"
              >
                <td className="py-2.5 pl-6 pr-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={client.name ?? client.email} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/coach/clients/${client.id}`}
                          className="text-[15px] font-bold text-black hover:underline dark:text-zinc-50"
                        >
                          {client.name ?? client.email}
                        </Link>
                        {client.needsReview && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>
                        )}
                        {onHold.has(client.id) && (
                          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">HOLD</span>
                        )}
                        {(unreadByClient[client.id] ?? 0) > 0 && (
                          <Link href={`/coach/clients/${client.id}?open=messages`} aria-label="Unread messages" className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                            <MessageSquare className="h-3 w-3" /> {unreadByClient[client.id]}
                          </Link>
                        )}
                      </div>
                      <p className="truncate text-xs text-zinc-500">{client.email}</p>
                      {reasonChips(client.id)}
                    </div>
                  </div>
                </td>
                {scope === 'gym' && (
                  <td className="px-4 py-2.5 text-zinc-500">
                    {'coachName' in client ? (client.isOwnClient ? 'You' : client.coachName) : ''}
                  </td>
                )}
                <td className="px-4 py-2.5">
                  <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold ${pillCls(statusFor(client.id, health).label)}`}>
                    {statusFor(client.id, health).label}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-black dark:text-zinc-50">{client.planName ?? <span className="text-zinc-500">No plan</span>}</td>
                <td className="whitespace-nowrap px-4 py-2.5 text-zinc-600 dark:text-zinc-400">
                  {health?.lastActiveDate
                    ? health.daysSinceActive === 0
                      ? 'Today'
                      : health.daysSinceActive === 1
                        ? 'Yesterday'
                        : `${health.daysSinceActive}d ago`
                    : 'Never logged'}
                </td>
                <td className={`px-4 py-2.5 text-[15px] font-bold ${creditCls(client)}`}>{client.balance}</td>
                <td className="py-2 pl-2 pr-4 text-right">
                  <Link
                    href={`/coach/clients/${client.id}?open=messages`}
                    aria-label={`Message ${client.name ?? client.email}`}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"
                  >
                    <MessageSquare className="h-[18px] w-[18px]" />
                  </Link>
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={scope === 'gym' ? 7 : 6} className="border-t border-black/[.07] p-4 text-center text-zinc-500 dark:border-white/10">
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {moreRows > 0 && (
        <button
          type="button"
          onClick={() => setPaging({ key: listKey, count: showMore(shownCount, rows.length) })}
          className="h-11 w-full rounded-xl border-[1.5px] border-black/20 text-sm font-bold text-black hover:bg-black/[.03] dark:border-white/25 dark:text-zinc-50 dark:hover:bg-white/5"
        >
          Show more ({moreRows} left)
        </button>
      )}
      </>
      )}
      {legend && (
        <BottomSheet title="What the colours mean" onClose={() => setLegend(false)}>
          <p className="mb-3 text-sm text-zinc-600 dark:text-zinc-400">
            Logging shows how long since the member last logged anything (food, weight, steps, sleep, any part of the daily check-in), or since
            they joined if they never have. It does not measure class attendance or progress.
          </p>
          <dl className="space-y-3 text-sm">
            {[
              ['Green', 'text-emerald-600 dark:text-emerald-400', `Logged in the last ${SLIPPING_DAYS - 1} days.`],
              ['Amber', 'text-amber-600 dark:text-amber-400', `${SLIPPING_DAYS} or ${QUIET_DAYS - 1} days since they last logged anything.`],
              [
                'Red',
                'text-red-600 dark:text-red-400',
                `Gone quiet: ${QUIET_DAYS} days or more without logging. The Gone quiet filter and the dashboard's "Members to check in on" use the same ${QUIET_DAYS} days.`,
              ],
              ['Not monitored', 'text-zinc-400', 'Check-in reminders are switched off for them (Credits & plan), so they are never counted as gone quiet.'],
              ['Not set up', 'text-zinc-400', 'They have not finished setting up the app, so there is no logging to follow yet.'],
              ['On hold', 'text-sky-600 dark:text-sky-400', 'Membership on hold (holiday, injury). Left out of Gone quiet and the red flag lists.'],
            ].map(([label, cls, text]) => (
              <div key={label}>
                <dt className={`font-bold ${cls}`}>{label}</dt>
                <dd className="text-zinc-600 dark:text-zinc-400">{text}</dd>
              </div>
            ))}
            <div>
              <dt className="font-bold text-black dark:text-zinc-50">Credits</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                Red when they are out of credits with nothing booked this week or later (the Out of credits filter): members on a plan with
                weekly credits, or who booked a class in the last 4 weeks. A plan member at 0 who has booked their week is not out.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-black dark:text-zinc-50">Check in on</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                The same list as the dashboard&apos;s &quot;Members to check in on&quot;: gone quiet, missed last week, weight stalled, missed 2 or
                more booked classes in 2 weeks, or out of credits and not booked. Members on hold are left out.
              </dd>
            </div>
          </dl>
        </BottomSheet>
      )}
    </div>
  );
}
