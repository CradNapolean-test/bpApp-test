'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowUpDown, CalendarCheck, Check, ClipboardCheck, Hourglass, Info, MessageSquare, Search, Users } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { Avatar } from '@/app/_components/Avatar';
import { GroupsManager } from './GroupsManager';
import { FadeScrollRow } from './FadeScrollRow';
import { MemberBulkSheet, type BulkMode } from './MemberBulkSheet';
import { useProvideMembersListActions } from './MembersPageActions';
import { useReadSinceDrawn } from './CoachUnreadContext';
import { useSlidingThumb } from '@/app/_components/motion/useSlidingThumb';
import { useFlipList } from '@/app/_components/motion/useFlipList';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { toCsv, downloadTextFile } from '@/lib/utils/csv';
import { LIST_STEP, remainingAfter, showMore, visibleCount } from '@/lib/paging';
import { QUIET_DAYS, SLIPPING_DAYS, hasReason, type FollowUp, type FollowUpKind } from '@/lib/followUp';
import {
  checkInText,
  lastClassText,
  memberCount,
  planEndOf,
  planEndText,
  keepSelectable,
  selectAllState,
  toggleAll,
  toggleSelected,
  type CheckIn,
  type PlanEnd,
} from '@/lib/memberList';
import type { ClientHealthBucket, ClientHealthStatus, CoachClientRow, GymClientRow, MemberListActivity } from '@/lib/data/coach';
import type { ClientGroupWithMembers } from '@/lib/data/types';

const NO_UNREAD: Record<string, number> = {};
const NO_ACTIVITY: Record<string, MemberListActivity> = {};
const NO_CHECK_IN: CheckIn = { kind: 'none' };

type SortKey = 'name' | 'lastActive' | 'status' | 'credits' | 'planEnd';
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
  unreadByClient: drawnUnread = NO_UNREAD,
  initialPlan = '',
  initialScope = 'mine',
  initialQuick = 'all',
  followUps = {},
  notSetUpIds = [],
  activity = NO_ACTIVITY,
  todayIso,
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
  // This week's check-in and the last class attended, by member (getMemberListActivity, CL6).
  activity?: Record<string, MemberListActivity>;
  // The gym's today: plan ends, check-in weeks and "3d ago" are counted from it.
  todayIso: string;
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
  // Select mode (CL18): tick boxes on the rows, and a bar at the bottom with Message each and Add to a group. Only the coach's own members
  // can be ticked: a message can only go into their own members' chats (the database's rule), and Manage groups offers the same members.
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [bulk, setBulk] = useState<BulkMode | null>(null);
  // A conversation read since the counts were drawn (in the Messages drawer, or on the member's page before coming Back) shows none.
  const readSinceDrawn = useReadSinceDrawn(drawnUnread);
  const unreadOf = (clientId: string) => (readSinceDrawn(clientId) ? 0 : (drawnUnread[clientId] ?? 0));
  // Motion (GSAP): the My members / Whole gym highlight slides; the rows settle in when the list first shows and when the scope changes;
  // and when a filter or the sort changes, the rows that stay glide to their new places (Flip), so the coach sees what moved.
  const rootRef = useRef<HTMLDivElement>(null);
  const scopeTrack = useRef<HTMLDivElement>(null);
  useSlidingThumb(scopeTrack, scope);
  useStaggerIn(rootRef, '[data-flip-id]', scope);
  const captureFlip = useFlipList(rootRef, `${quick}|${planFilter}|${groupId}|${sortKey}|${asc}`);
  const onHold = useMemo(() => new Set(holdIds), [holdIds]);
  const notSetUp = useMemo(() => new Set(notSetUpIds), [notSetUpIds]);
  // The coach's own members: the only ones that can be ticked.
  const own = useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  const activeClients: (CoachClientRow | GymClientRow)[] = scope === 'gym' && gymClients ? gymClients : clients;

  const statusById = useMemo(() => new Map(statuses.map((s) => [s.clientId, s])), [statuses]);
  const planEndFor = useCallback((c: CoachClientRow): PlanEnd => planEndOf(c.planName != null, c.planEndsOn, todayIso), [todayIso]);

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
    // Plan end, soonest first: a plan whose last day has passed, then by the day, then plans with no end, then no plan.
    const endKey = (c: CoachClientRow) => {
      const p = planEndFor(c);
      return p.kind === 'ends' || p.kind === 'ended' ? p.endsOn : p.kind === 'ongoing' ? '9999-12-30' : '9999-12-31';
    };
    merged.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'name') {
        cmp = (a.client.name ?? a.client.email).localeCompare(b.client.name ?? b.client.email);
      } else if (sortKey === 'credits') {
        cmp = a.client.balance - b.client.balance;
      } else if (sortKey === 'status') {
        const rank = (r: typeof a) => (notSetUp.has(r.client.id) ? STATUS_RANK.notsetup : (STATUS_RANK[r.health?.status ?? 'unmonitored'] ?? 9));
        cmp = rank(a) - rank(b);
      } else if (sortKey === 'planEnd') {
        cmp = endKey(a.client).localeCompare(endKey(b.client));
      } else {
        // Never-logged sorts as most stale rather than silently landing at one end.
        cmp = (b.health?.daysSinceActive ?? Infinity) - (a.health?.daysSinceActive ?? Infinity);
      }
      return asc ? cmp : -cmp;
    });
    return merged;
  }, [activeClients, statusById, sortKey, asc, query, groupId, groups, quick, planFilter, inQuick, notSetUp, planEndFor]);

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

  // Select mode. "Select all" is for the members the filters show (the "Showing 12 of 40" count), the coach's own only. Ticks stay when the
  // filters change, so a coach can search for one member, tick them, then search for the next. A member who is no longer the coach's
  // (moved since the page was drawn) drops out of the selection.
  const selectedIds = useMemo(() => [...selected].filter((id) => own.has(id)), [selected, own]);
  const selectableShown = useMemo(() => rows.filter(({ client }) => own.has(client.id)).map(({ client }) => client.id), [rows, own]);
  const allState = selectAllState(new Set(selectedIds), selectableShown);
  const othersShown = rows.length - selectableShown.length;
  const toggleOne = (id: string) => setSelected((s) => toggleSelected(s, id));
  const toggleShown = () => setSelected((s) => toggleAll(keepSelectable(s, own), selectableShown));
  function stopSelecting() {
    setSelecting(false);
    setSelected(new Set());
  }

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
  const checkInOfMember = (id: string) => activity[id]?.checkIn ?? NO_CHECK_IN;
  const nameOf = (c: CoachClientRow) => c.name ?? c.email;

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
      ['Name', 'Email', 'Logging', 'Last active', 'Days since active', 'Credits', 'Check in on', 'Plan', 'Plan ends', 'Check-in', 'Last class'],
      rows.map(({ client, health }) => {
        const pe = planEndFor(client);
        const last = activity[client.id]?.lastClass;
        return [
          client.name ?? '',
          client.email,
          statusFor(client.id, health).label,
          health?.lastActiveDate ?? 'Never logged',
          health?.daysSinceActive ?? '',
          client.balance,
          followUps[client.id]?.reasons.map((r) => r.label).join('; ') ?? '',
          client.planName ?? '',
          pe.kind === 'ends' || pe.kind === 'ended' ? pe.endsOn : pe.kind === 'ongoing' ? 'Ongoing' : '',
          checkInText(checkInOfMember(client.id)).detail,
          last ? `${last.date}${last.className ? ` ${last.className}` : ''}` : '',
        ];
      })
    );
    downloadTextFile(`members-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv;charset=utf-8;');
  }

  // The page's one "⋯" menu, in the header, runs these two (CL1).
  useProvideMembersListActions({ exportCsv: handleExport, manageGroups: () => setManagingGroups(true) });

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

  const headerCls = 'px-3 py-3 text-left font-bold first:pl-6';
  const sortBtn = 'inline-flex items-center gap-1 uppercase tracking-[0.08em] hover:text-black dark:hover:text-zinc-300';
  const filterSelectCls = 'h-11 min-w-0 rounded-full border border-black/[.14] bg-card px-4 text-sm font-bold dark:border-white/15';
  // Member, Logging, Plan, Plan end, Check-in, Last class and Credits; then the tick box while selecting, or else the message button (the
  // bar has Message each); and Coach for the whole gym.
  const colCount = 8 + (scope === 'gym' ? 1 : 0);
  const lastActiveText = (health: ClientHealthStatus | null) =>
    health?.lastActiveDate ? (health.daysSinceActive === 0 ? 'Today' : health.daysSinceActive === 1 ? 'Yesterday' : `${health.daysSinceActive}d ago`) : 'Never logged';

  return (
    <div ref={rootRef} className="space-y-3">
      {gymClients && (
        <div ref={scopeTrack} role="group" aria-label="Whose members" className="relative grid w-full grid-cols-2 gap-1 rounded-xl bg-black/[.06] p-1 sm:w-max dark:bg-white/10">
          <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
          {/* The counts are here on a phone, where the page header leaves its "14 members with you, 90 in the gym" line out (CL3). */}
          <button type="button" aria-pressed={scope === 'mine'} data-active={scope === 'mine'} onClick={() => setScope('mine')} className={scopeBtnCls(scope === 'mine')}>
            My members <span className="ml-1 font-semibold opacity-60 sm:hidden">{clients.length}</span>
          </button>
          <button type="button" aria-pressed={scope === 'gym'} data-active={scope === 'gym'} onClick={() => setScope('gym')} className={scopeBtnCls(scope === 'gym')}>
            Whole gym <span className="ml-1 font-semibold opacity-60 sm:hidden">{gymClients.length}</span>
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
      {/* CL3: search and the plan filter share one row on a phone, the search taking the rest of it. With groups there is a group filter
          too, and three don't fit beside each other on a phone: the search gets the row and the two filters share the next. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className={`relative min-w-0 flex-1 ${groups.length > 0 ? 'basis-full sm:basis-56' : 'basis-40'} sm:max-w-xs`}>
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search members"
            aria-label="Search members"
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
            className={`${filterSelectCls} max-sm:flex-1 sm:max-w-[10rem]`}
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
            className={`${filterSelectCls} ${groups.length > 0 ? 'max-sm:flex-1' : 'max-sm:max-w-[9rem]'} sm:max-w-[10rem]`}
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
      </div>
      <FadeScrollRow label="Quick filters" activeKey={quick}>
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
            className={`h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-sm font-bold ${
              quick === key
                ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]'
                : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
            }`}
          >
            {label}
            {count > 0 ? <span className={quick === key ? 'ml-1.5 opacity-70' : 'ml-1.5 text-zinc-500'}>{count}</span> : null}
          </button>
        ))}
      </FadeScrollRow>
      <div className="flex items-center gap-2 px-1">
        <p className="min-w-0 flex-1 text-sm text-zinc-500">
          {/* Says whose members the list and the counts above are for: they change with My clients / Whole gym (CL16). */}
          {rows.length === activeClients.length ? `${rows.length} ${whose}` : `Showing ${rows.length} of ${activeClients.length} ${whose}`}
          {filtersOn && (
            <button type="button" onClick={clearFilters} className="ml-2 font-bold text-accent">
              Clear filters
            </button>
          )}
        </p>
        {/* On a phone the sort is a round button with the arrows on it (it opens the same list) and the colour key is an "i", so the
            controls fit on the count's row instead of taking a row of their own (CL3). */}
        <div className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-black/[.14] bg-card focus-within:ring-2 focus-within:ring-accent md:w-auto md:border-0 md:bg-transparent md:focus-within:ring-0 dark:border-white/15">
          <ArrowUpDown aria-hidden className="pointer-events-none h-4 w-4 text-zinc-600 md:hidden dark:text-zinc-300" />
          <select
            aria-label="Sort by"
            value={sortKey}
            onChange={(e) => {
              captureFlip();
              setSortKey(e.target.value as SortKey);
              setAsc(true);
            }}
            className="absolute inset-0 h-11 w-11 cursor-pointer opacity-0 md:static md:w-auto md:rounded-full md:border md:border-black/[.14] md:bg-card md:px-4 md:text-sm md:font-bold md:opacity-100 md:dark:border-white/15"
          >
            <option value="name">Name A–Z</option>
            <option value="lastActive">Most inactive first</option>
            <option value="status">Logging, red first</option>
            <option value="credits">Fewest credits first</option>
            <option value="planEnd">Plan ending first</option>
          </select>
        </div>
        <button
          type="button"
          onClick={() => setLegend(true)}
          aria-label="Colour key"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-accent md:w-auto md:px-1 md:text-sm md:font-bold"
        >
          <Info aria-hidden className="h-5 w-5 md:hidden" />
          <span aria-hidden className="max-md:hidden">
            Colour key
          </span>
        </button>
        <button
          type="button"
          aria-pressed={selecting}
          onClick={() => (selecting ? stopSelecting() : setSelecting(true))}
          className={`h-11 shrink-0 rounded-full px-4 text-sm font-bold ${
            selecting ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black dark:border-white/15 dark:text-zinc-50'
          }`}
        >
          {selecting ? 'Done' : 'Select'}
        </button>
      </div>
      {managingGroups && (
        <GroupsManager groups={groups} clients={clients} onClose={() => setManagingGroups(false)} />
      )}
      {selecting && (
        <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 px-3 md:hidden">
          <label className="flex min-h-11 items-center gap-3 text-sm font-bold text-black dark:text-zinc-50">
            <SelectBox state={allState} disabled={selectableShown.length === 0} onChange={toggleShown} label={`Select all ${memberCount(selectableShown.length)} shown`} />
            Select all {selectableShown.length}
          </label>
          {othersShown > 0 && <span className="text-xs text-zinc-500">Only your own members can be ticked.</span>}
        </div>
      )}
      {/* Phone: one card per client (the table needs ~34rem of width). */}
      <ul className="divide-y divide-black/[.07] overflow-hidden rounded-[20px] border border-black/[.08] bg-card md:hidden dark:divide-white/10 dark:border-white/10">
        {shownRows.map(({ client, health }) => {
          const status = statusFor(client.id, health);
          const unread = unreadOf(client.id);
          const last = health?.lastActiveDate
            ? health.daysSinceActive === 0
              ? 'Active today'
              : health.daysSinceActive === 1
                ? 'Active yesterday'
                : `Active ${health.daysSinceActive}d ago`
            : 'Never logged';
          const pe = planEndText(planEndFor(client), todayIso);
          const ci = checkInOfMember(client.id);
          const ciText = checkInText(ci);
          const lc = lastClassText(activity[client.id]?.lastClass, todayIso);
          const selectable = own.has(client.id);
          const isSelected = selectable && selected.has(client.id);
          // CL6 on a phone: plan end, check-in and last class as one short line under the name, each with its icon (the Colour key says
          // which is which; a screen reader hears the words) and each left out when there is nothing to say.
          const facts: { key: string; Icon: typeof Hourglass; label: string; text: string; cls?: string }[] = [];
          if (pe.short) facts.push({ key: 'plan', Icon: Hourglass, label: 'Plan end', text: pe.short, cls: pe.soon ? 'font-bold text-amber-700 dark:text-amber-300' : undefined });
          if (ciText.short)
            facts.push({
              key: 'checkin',
              Icon: ClipboardCheck,
              label: 'Check-in',
              text: ciText.short,
              cls: ci.kind === 'waiting' ? 'font-bold text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-400',
            });
          if (lc.short) facts.push({ key: 'class', Icon: CalendarCheck, label: 'Last class', text: lc.short });
          const card = (
            <>
              <Avatar name={nameOf(client)} size="md" />
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-1.5 truncate font-semibold text-black dark:text-zinc-50">
                  <span className="truncate">{nameOf(client)}</span>
                  {client.needsReview && <span className="shrink-0 rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>}
                  {onHold.has(client.id) && <span className="shrink-0 rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">HOLD</span>}
                </p>
                {facts.length > 0 && (
                  <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-600 dark:text-zinc-400">
                    {facts.map(({ key, Icon, label, text, cls }) => (
                      <span key={key} className={`inline-flex items-center gap-0.5 whitespace-nowrap ${cls ?? ''}`}>
                        <Icon aria-hidden className="h-3 w-3 shrink-0" />
                        <span className="sr-only">{label}: </span>
                        {text}
                      </span>
                    ))}
                  </p>
                )}
                {/* The plan's whole name, wrapping if it must: it was cut off ("Big D…", CL3). The credits moved here from a column of their
                    own, so the line above has the width to stay one line. */}
                <p className="break-words text-xs text-zinc-500">
                  <span className={`font-semibold ${status.cls}`}>{status.label}</span> · {last}
                  {client.planName ? ` · ${client.planName}` : ' · No plan'}
                  {' · '}
                  <span className={`font-semibold ${creditCls(client)}`}>
                    {client.balance} credit{client.balance === 1 ? '' : 's'}
                  </span>
                  {'coachName' in client && !client.isOwnClient ? ` · ${client.coachName}` : ''}
                </p>
                {reasonChips(client.id)}
              </div>
            </>
          );
          return (
            <li key={client.id} data-flip-id={client.id} className={`flex items-stretch ${isSelected ? 'bg-accent-soft' : ''}`}>
              {selecting ? (
                selectable ? (
                  <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 p-3">
                    <SelectBox state={isSelected ? 'all' : 'none'} onChange={() => toggleOne(client.id)} label={`Select ${nameOf(client)}`} />
                    {card}
                  </label>
                ) : (
                  <div className="flex min-w-0 flex-1 items-center gap-3 p-3 opacity-60">
                    <SelectBox state="none" disabled onChange={() => {}} label={`${nameOf(client)} is another coach's member and cannot be ticked`} />
                    {card}
                  </div>
                )
              ) : (
                <>
                  <Link href={`/coach/clients/${client.id}`} className="flex min-w-0 flex-1 items-center gap-3 py-3 pl-3 pr-2">
                    {card}
                  </Link>
                  <Link
                    href={`/coach/clients/${client.id}?open=messages`}
                    aria-label={unread > 0 ? `Message ${nameOf(client)} (${unread} unread)` : `Message ${nameOf(client)}`}
                    className="relative my-2 mr-2 flex w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
                  >
                    <MessageSquare className="h-5 w-5" />
                    {unread > 0 && <span className="absolute right-2.5 top-3 h-2.5 w-2.5 rounded-full bg-accent" />}
                  </Link>
                </>
              )}
            </li>
          );
        })}
        {rows.length === 0 && <li className="p-3 text-center text-sm text-zinc-500">{emptyText}</li>}
      </ul>
      <div className="hidden overflow-x-auto rounded-[20px] border border-black/[.08] bg-card md:block dark:border-white/10">
        <table className="w-full min-w-[40rem] text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
            {selecting && (
              <th className="w-12 py-3 pl-6 pr-0 text-left">
                <SelectBox state={allState} disabled={selectableShown.length === 0} onChange={toggleShown} label={`Select all ${memberCount(selectableShown.length)} shown`} />
              </th>
            )}
            <th className={headerCls}>
              <button onClick={() => toggleSort('name')} className={sortBtn}>
                Member <ArrowUpDown className="h-3 w-3" />
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
              <button onClick={() => toggleSort('planEnd')} className={sortBtn}>
                Plan end <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            <th className={headerCls}>Check-in</th>
            <th className={headerCls}>Last class</th>
            <th className={headerCls}>
              <button onClick={() => toggleSort('credits')} className={sortBtn}>
                Credits <ArrowUpDown className="h-3 w-3" />
              </button>
            </th>
            {!selecting && (
              <th className={headerCls}>
                <span className="sr-only">Message</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {shownRows.map(({ client, health }) => {
            const planEnd = planEndFor(client);
            const pe = planEndText(planEnd, todayIso);
            const ci = checkInOfMember(client.id);
            const ciText = checkInText(ci);
            const lastClass = activity[client.id]?.lastClass ?? null;
            const lc = lastClassText(lastClass, todayIso);
            const selectable = own.has(client.id);
            const isSelected = selectable && selected.has(client.id);
            return (
              <tr
                key={client.id}
                data-flip-id={client.id}
                className={`border-t border-black/[.07] dark:border-white/10 ${isSelected ? 'bg-accent-soft' : 'hover:bg-black/[.02] dark:hover:bg-white/[.03]'}`}
              >
                {selecting && (
                  <td className="py-2.5 pl-6 pr-0">
                    {selectable ? (
                      <SelectBox state={isSelected ? 'all' : 'none'} onChange={() => toggleOne(client.id)} label={`Select ${nameOf(client)}`} />
                    ) : (
                      <SelectBox state="none" disabled onChange={() => {}} label={`${nameOf(client)} is another coach's member and cannot be ticked`} />
                    )}
                  </td>
                )}
                <td className={`py-2.5 pr-3 ${selecting ? 'pl-3' : 'pl-6'}`}>
                  <div className="flex items-center gap-3">
                    <Avatar name={nameOf(client)} size="md" />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Link
                          href={`/coach/clients/${client.id}`}
                          className="whitespace-nowrap text-[15px] font-bold text-black hover:underline dark:text-zinc-50"
                        >
                          {nameOf(client)}
                        </Link>
                        {client.needsReview && (
                          <span className="rounded-full bg-warning/15 px-1.5 py-0.5 text-[10px] font-extrabold text-warning">NEW</span>
                        )}
                        {onHold.has(client.id) && (
                          <span className="rounded-full bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-sky-600 dark:text-sky-400">HOLD</span>
                        )}
                        {unreadOf(client.id) > 0 && (
                          <Link href={`/coach/clients/${client.id}?open=messages`} aria-label="Unread messages" className="inline-flex items-center gap-1 text-xs font-bold text-accent">
                            <MessageSquare className="h-3 w-3" /> {unreadOf(client.id)}
                          </Link>
                        )}
                      </div>
                      <p className="max-w-[13rem] truncate text-xs text-zinc-500">{client.email}</p>
                      {reasonChips(client.id)}
                    </div>
                  </div>
                </td>
                {scope === 'gym' && (
                  <td className="px-3 py-2.5 text-zinc-500">
                    {'coachName' in client ? (client.isOwnClient ? 'You' : client.coachName) : ''}
                  </td>
                )}
                {/* Logging and, under it, when they last logged (it was a Last active column of its own; the sort still has "Most inactive
                    first"), so the new columns fit at laptop width (CL6). */}
                <td className="px-3 py-2.5">
                  <span className={`inline-flex h-6 items-center whitespace-nowrap rounded-full px-2.5 text-xs font-extrabold ${pillCls(statusFor(client.id, health).label)}`}>
                    {statusFor(client.id, health).label}
                  </span>
                  <span className="mt-0.5 block whitespace-nowrap text-xs text-zinc-500">{lastActiveText(health)}</span>
                </td>
                <td className="px-3 py-2.5 text-black dark:text-zinc-50">{client.planName ?? <span className="text-zinc-500">No plan</span>}</td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  <span className={pe.soon ? 'font-bold text-amber-700 dark:text-amber-300' : planEnd.kind === 'none' ? 'text-zinc-400' : 'text-zinc-600 dark:text-zinc-400'}>
                    {pe.text}
                  </span>
                  {planEnd.kind === 'ends' && planEnd.soon && (
                    <span className="mt-0.5 flex">
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-extrabold text-amber-800 dark:bg-amber-400/15 dark:text-amber-300">Ending soon</span>
                    </span>
                  )}
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {ci.kind === 'waiting' ? (
                    <Link
                      href={`/coach/clients/${client.id}?open=checkin&week=${ci.weeks[0]}`}
                      title={ciText.detail}
                      className="inline-flex h-6 items-center rounded-full bg-amber-100 px-2.5 text-xs font-extrabold text-amber-800 hover:underline dark:bg-amber-400/15 dark:text-amber-300"
                    >
                      {ciText.text}
                      <span className="sr-only">: {ciText.detail}</span>
                    </Link>
                  ) : ci.kind === 'reviewed' ? (
                    <span title={ciText.detail} className="inline-flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                      <Check aria-hidden className="h-3.5 w-3.5" /> {ciText.text}
                    </span>
                  ) : (
                    <span title={ciText.detail} className="text-zinc-400">
                      —<span className="sr-only">{ciText.detail}</span>
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-zinc-600 dark:text-zinc-400">
                  <span className="whitespace-nowrap">{lc.text}</span>
                  {lastClass?.className && (
                    <span className="block max-w-[7.5rem] truncate text-xs text-zinc-500" title={lastClass.className}>
                      {lastClass.className}
                    </span>
                  )}
                </td>
                <td className={`px-3 py-2.5 text-[15px] font-bold ${creditCls(client)}`}>{client.balance}</td>
                {!selecting && (
                  <td className="py-2 pl-2 pr-4 text-right">
                    <Link
                      href={`/coach/clients/${client.id}?open=messages`}
                      aria-label={`Message ${nameOf(client)}`}
                      className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-accent-soft text-accent"
                    >
                      <MessageSquare className="h-[18px] w-[18px]" />
                    </Link>
                  </td>
                )}
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={colCount} className="border-t border-black/[.07] p-4 text-center text-zinc-500 dark:border-white/10">
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
      {selecting && (
        // Stays at the bottom of the screen (above the phone's tab bar) while the list scrolls under it.
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 md:bottom-4">
          <div
            role="region"
            aria-label="Selected members"
            className="flex flex-wrap items-center gap-2 rounded-2xl bg-[#1d1d1b] p-3 text-white shadow-xl dark:bg-zinc-100 dark:text-[#1d1d1b]"
          >
            <p aria-live="polite" className="min-w-0 flex-1 px-1 text-sm font-bold">
              {selectedIds.length === 0 ? 'Tick the members to act on' : `${memberCount(selectedIds.length)} selected`}
            </p>
            {selectedIds.length > 0 && (
              <button type="button" onClick={() => setSelected(new Set())} className="min-h-11 px-2 text-sm font-bold underline">
                Clear
              </button>
            )}
            <div className="flex w-full gap-2 md:w-auto">
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => setBulk('message')}
                className="h-11 flex-1 whitespace-nowrap rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground disabled:opacity-40"
              >
                Message each
              </button>
              <button
                type="button"
                disabled={selectedIds.length === 0}
                onClick={() => setBulk('group')}
                className="h-11 flex-1 whitespace-nowrap rounded-xl bg-white/15 px-4 text-sm font-extrabold disabled:opacity-40 dark:bg-black/10"
              >
                Add to a group
              </button>
            </div>
          </div>
        </div>
      )}
      </>
      )}
      {bulk && (
        <MemberBulkSheet
          mode={bulk}
          members={selectedIds.map((id) => ({ id, name: nameOf(own.get(id)!) }))}
          groups={groups}
          onClose={() => setBulk(null)}
          onFinished={(failedIds) => {
            setBulk(null);
            if (failedIds.length > 0) setSelected(new Set(failedIds));
            else stopSelecting();
          }}
        />
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
              <dt className="font-bold text-black dark:text-zinc-50">Plan end</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                The last day of their plan, when it has one. &quot;Ending soon&quot; in its last 2 weeks. On a phone it has an hourglass{' '}
                <Hourglass aria-hidden className="inline h-3 w-3" />.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-black dark:text-zinc-50">Check-in</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                Last week&apos;s check-in (Monday to Sunday): &quot;To review&quot; when they logged something and you haven&apos;t marked it Reviewed,
                as on the dashboard. The week before counts too until you review it. On a phone it has a clipboard{' '}
                <ClipboardCheck aria-hidden className="inline h-3 w-3" />.
              </dd>
            </div>
            <div>
              <dt className="font-bold text-black dark:text-zinc-50">Last class</dt>
              <dd className="text-zinc-600 dark:text-zinc-400">
                The last class they were marked as attending. On a phone it has a calendar with a tick <CalendarCheck aria-hidden className="inline h-3 w-3" />.
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

// A tick box: on, off, or (for "select all") some of them.
function SelectBox({ state, onChange, label, disabled = false }: { state: 'all' | 'some' | 'none'; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <input
      type="checkbox"
      aria-label={label}
      checked={state === 'all'}
      disabled={disabled}
      ref={(el) => {
        if (el) el.indeterminate = state === 'some';
      }}
      onChange={onChange}
      className="h-5 w-5 shrink-0 cursor-pointer accent-[var(--accent)] disabled:cursor-not-allowed"
    />
  );
}
