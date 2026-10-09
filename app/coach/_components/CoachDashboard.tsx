'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  FileText,
  Flag,
  MessageSquare,
  Plus,
  Trash2,
  Trophy,
  Utensils,
  Users,
} from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { Card, SectionLabel } from '@/app/_components/ui';
import { useAction } from '@/app/_components/useAction';
import { markReviewed } from '@/lib/data/coachReviews';
import { formatClassTime } from '@/lib/utils/dates';
import type { CoachDashboardData, DashboardScope } from '@/lib/data/coachDashboard';
import type { ScheduleOccurrence } from '@/lib/data/types';
import { AddClientForm } from './AddClientForm';
import { JoinLinkCard } from './JoinLinkCard';

const SESSION_MIN = 45;
const toMin = (t: string | null) => {
  const [h, m] = (t ?? '0:0').split(':').map(Number);
  return h * 60 + (m || 0);
};

const sessionHref = (o: ScheduleOccurrence) => `/coach/classes?tab=sessions&date=${o.date}&class=${o.classId}`;
const dayShort = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const weekShort = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

type Tone = 'urgent' | 'amber' | 'teal' | 'green' | 'violet';
const TONE: Record<Tone, { chip: string; badge: string }> = {
  urgent: { chip: 'bg-danger/15 text-danger', badge: 'bg-danger/15 text-danger' },
  amber: { chip: 'bg-warning/15 text-warning', badge: 'bg-warning/15 text-warning' },
  teal: { chip: 'bg-accent/15 text-accent', badge: 'bg-accent/15 text-accent' },
  green: { chip: 'bg-success/15 text-success', badge: 'bg-success/15 text-success' },
  violet: { chip: 'bg-[#a07aff]/15 text-[#a07aff]', badge: 'bg-[#a07aff]/15 text-[#a07aff]' },
};

interface TodoItem {
  key: string;
  clientId: string;
  title: string;
  hint: string;
  href: string;
  // Present when the coach can mark this reviewed from here (their own member).
  review?: () => Promise<{ ok: boolean }>;
}
interface TodoGroup {
  key: string;
  icon: typeof Check;
  tone: Tone;
  title: string;
  summary: string;
  items: TodoItem[];
  // Badge number when it is not simply the number of items.
  count?: number;
  // Single row, no expansion (e.g. one deletion request).
  direct?: boolean;
}

function TodoRow({ group, open, onToggle }: { group: TodoGroup; open: boolean; onToggle: () => void }) {
  const Icon = group.icon;
  const tone = TONE[group.tone];
  const { run, busy } = useAction();
  const single = group.direct && group.items.length === 1;
  const header = (
    <>
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${tone.chip}`}>
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{group.title}</span>
        <span className="block truncate text-xs text-zinc-500">{group.summary}</span>
      </span>
      <span className={`rounded-full px-2.5 py-0.5 text-xs font-extrabold ${tone.badge}`}>{group.count ?? group.items.length}</span>
      {single ? <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" /> : <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />}
    </>
  );
  return (
    <div>
      {single ? (
        <Link href={group.items[0].href} className="flex items-center gap-3 py-3">
          {header}
        </Link>
      ) : (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 py-3">
          {header}
        </button>
      )}
      {open && !single && (
        <ul className="mb-2 ml-[52px] space-y-1.5">
          {group.items.map((item) => (
            <li key={item.key} className="flex items-center gap-2 rounded-xl bg-black/[.03] px-3 py-2 dark:bg-white/[.04]">
              <Link href={item.href} className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{item.title}</span>
                <span className="block truncate text-xs text-zinc-500">{item.hint}</span>
              </Link>
              {item.review && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => run(async () => item.review!(), { success: 'Marked as reviewed' })}
                  className="shrink-0 rounded-full bg-accent/15 px-3 py-1 text-xs font-extrabold text-accent disabled:opacity-50"
                >
                  Reviewed
                </button>
              )}
              <Link href={item.href} aria-label="Open" className="shrink-0 text-zinc-400">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function CoachDashboard({ data }: { data: CoachDashboardData }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAllToCheck, setShowAllToCheck] = useState(false);
  const { scope, isAdmin, coaches, selectedCoachId, stats } = data;
  const own = (mineFlag: boolean) => scope === 'mine' || mineFlag;

  // ---- To do ----
  const groups: TodoGroup[] = [];

  if (data.deletionRequests.length > 0) {
    groups.push({
      key: 'delete',
      icon: Trash2,
      tone: 'urgent',
      title: data.deletionRequests.length === 1 ? 'Account deletion request' : 'Account deletion requests',
      summary: data.deletionRequests.length === 1 ? `${data.deletionRequests[0].name}: their data needs removing` : 'Members asked for their data to be removed',
      direct: true,
      items: data.deletionRequests.map((d) => ({
        key: d.clientId,
        clientId: d.clientId,
        title: d.name,
        hint: 'Asked to delete their account',
        href: `/coach/clients/${d.clientId}`,
      })),
    });
  }

  if (data.unreadThreads.length > 0) {
    const names = data.unreadThreads.map((t) => t.name);
    groups.push({
      key: 'messages',
      icon: MessageSquare,
      tone: 'teal',
      title: 'Reply to messages',
      summary: names.length <= 2 ? names.join(' and ') : `${names[0]}, ${names[1]} and ${names.length - 2} more waiting`,
      items: data.unreadThreads.map((t) => ({
        key: t.clientId,
        clientId: t.clientId,
        title: t.name,
        hint: `${t.unread} unread message${t.unread === 1 ? '' : 's'}`,
        href: `/coach/clients/${t.clientId}?open=messages`,
      })),
    });
  }

  if (data.redFlags && data.redFlags.toContact > 0) {
    groups.push({
      key: 'redflags',
      icon: Flag,
      tone: 'urgent',
      title: 'Red flag follow-ups',
      summary: `${data.redFlags.toContact} of ${data.redFlags.flagged} flagged member${data.redFlags.flagged === 1 ? '' : 's'} not contacted yet (week of ${weekShort(data.redFlags.weekStart)})`,
      direct: true,
      count: data.redFlags.toContact,
      items: [
        {
          key: 'redflags',
          clientId: '',
          title: 'Red flags',
          hint: 'Open the weekly red flag list',
          href: '/coach/classes?tab=reports',
        },
      ],
    });
  }

  if (data.newMembers.length > 0) {
    groups.push({
      key: 'new',
      icon: ClipboardCheck,
      tone: 'amber',
      title: 'New members to review',
      summary: 'Check their plan and set up their membership',
      items: data.newMembers.map((n) => ({
        key: n.clientId,
        clientId: n.clientId,
        title: n.name,
        hint: n.reasons.filter((r) => r !== 'New member: check the starting plan').join(' · ') || 'Starting plan ready to check',
        href: `/coach/clients/${n.clientId}?open=profile`,
      })),
    });
  }

  if (data.checkins.length > 0) {
    groups.push({
      key: 'checkins',
      icon: Check,
      tone: 'green',
      title: 'Weekly check-ins to review',
      summary: `${new Set(data.checkins.map((c) => c.clientId)).size} member${new Set(data.checkins.map((c) => c.clientId)).size === 1 ? '' : 's'} with a week to look at`,
      items: data.checkins.map((c) => ({
        key: `${c.clientId}|${c.weekStart}`,
        clientId: c.clientId,
        title: c.name,
        hint: `Week of ${weekShort(c.weekStart)} · ${c.days} day${c.days === 1 ? '' : 's'} logged`,
        href: `/coach/clients/${c.clientId}?open=checkin&week=${c.weekStart}`,
        review: own(c.mine) ? () => markReviewed('week', c.clientId, c.weekStart) : undefined,
      })),
    });
  }

  if (data.photoReviews.length > 0) {
    groups.push({
      key: 'photos',
      icon: Utensils,
      tone: 'violet',
      title: 'Meal photos to review',
      summary: `${data.photoReviews.length} photo diar${data.photoReviews.length === 1 ? 'y' : 'ies'} with no feedback yet`,
      items: data.photoReviews.map((p) => ({
        key: p.clientId,
        clientId: p.clientId,
        title: p.name,
        hint: `${p.photos} photo${p.photos === 1 ? '' : 's'} · ${p.dates.map(dayShort).join(', ')}`,
        href: `/coach/clients/${p.clientId}?open=nutrition`,
        review: own(p.mine)
          ? async () => {
              let last: { ok: boolean } = { ok: true };
              for (const d of p.dates) last = await markReviewed('diary_day', p.clientId, d);
              return last;
            }
          : undefined,
      })),
    });
  }

  if (data.forms.length > 0) {
    groups.push({
      key: 'forms',
      icon: FileText,
      tone: 'violet',
      title: 'Forms to review',
      summary: `${data.forms.length} completed form${data.forms.length === 1 ? '' : 's'} to read`,
      items: data.forms.map((f) => ({
        key: f.assignmentId,
        clientId: f.clientId,
        title: f.name,
        hint: `${f.formName} · ${weekShort(f.completedAt.slice(0, 10))}`,
        href: `/coach/clients/${f.clientId}?open=forms`,
        review: own(f.mine) ? () => markReviewed('form', f.clientId, f.assignmentId) : undefined,
      })),
    });
  }

  if (data.scores.length > 0) {
    groups.push({
      key: 'scores',
      icon: Trophy,
      tone: 'violet',
      title: 'Peak week scores to verify',
      summary: `${data.scores[0].name}: ${data.scores[0].exercise}${data.scores[0].result ? ` ${data.scores[0].result}` : ''}${data.scores.length > 1 ? ` and ${data.scores.length - 1} more` : ''}`,
      items: data.scores.map((s) => ({
        key: `${s.clientId}|${s.exercise}`,
        clientId: s.clientId,
        title: s.name,
        hint: `${s.exercise}${s.result ? ` ${s.result}` : ''}`,
        href: `/coach/clients/${s.clientId}?open=bigdog`,
      })),
    });
  }

  // ---- Today ----
  // The gym's clock, to match the gym's date used for which sessions count as today.
  const clock = new Intl.DateTimeFormat('en-GB', { timeZone: data.timezone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date());
  const nowMin = Number(clock.find((p) => p.type === 'hour')?.value) * 60 + Number(clock.find((p) => p.type === 'minute')?.value);
  const today = data.occurrences.filter((o) => o.date === data.todayIso).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const inProgress = today.find((s) => toMin(s.startTime) <= nowMin && nowMin < toMin(s.startTime) + SESSION_MIN);
  const upNext = inProgress ?? today.find((s) => toMin(s.startTime) > nowMin) ?? null;
  const toMark = data.occurrences.filter((o) => (o.unmarkedCount ?? 0) > 0);

  const scopeHref = (s: DashboardScope, coachId?: string) => `/coach?scope=${s}${coachId ? `&coach=${coachId}` : ''}`;
  const scopeLabel = scope === 'gym' ? 'the whole gym' : scope === 'coach' ? coaches.find((c) => c.id === selectedCoachId)?.name ?? 'this coach' : 'your members';

  const deltaLast = stats.sessionsAttended - stats.sessionsAttendedLastWeek;
  const checkinPct = stats.checkinsOf > 0 ? Math.round((stats.checkinsIn / stats.checkinsOf) * 100) : 0;

  return (
    <div className="space-y-5 pb-20 lg:pb-0">
      {isAdmin && (
        <div className="space-y-2">
          <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {([
              ['mine', 'My members'],
              ['gym', 'Whole gym'],
              ['coach', 'By coach'],
            ] as [DashboardScope, string][]).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => router.push(key === 'coach' ? scopeHref('coach', selectedCoachId ?? coaches[0]?.id) : scopeHref(key))}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold ${
                  scope === key ? 'bg-accent text-accent-foreground' : 'bg-black/5 text-zinc-500 dark:bg-white/10'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {scope === 'coach' && coaches.length > 0 && (
            <select
              value={selectedCoachId ?? ''}
              onChange={(e) => router.push(scopeHref('coach', e.target.value))}
              className="w-full rounded-xl border border-black/10 bg-card px-3 py-2.5 text-base dark:border-white/10"
            >
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          {scope !== 'mine' && (
            <p className="text-xs text-zinc-500">
              Showing {scopeLabel}. Messages and the actions that need the member&apos;s own coach (marking things reviewed) stay with that coach.
            </p>
          )}
        </div>
      )}

      {/* ---- Today ---- */}
      <div>
        <SectionLabel>
          {today.length === 0 ? "Today's classes" : `${inProgress ? 'Happening now' : upNext ? 'Up next' : 'Today'} · ${today.length} session${today.length === 1 ? '' : 's'}`}
        </SectionLabel>
        {today.length === 0 ? (
          <Card className="text-sm text-zinc-500">No classes scheduled today.</Card>
        ) : (
          <div className="space-y-2.5">
            {upNext ? (
              <Link href={sessionHref(upNext)} className="flex items-center justify-between gap-3 rounded-2xl border border-accent/30 bg-accent/10 p-4">
                <span className="min-w-0">
                  <span className="block text-3xl font-black leading-tight text-black dark:text-zinc-50">{formatClassTime(upNext.startTime)}</span>
                  <span className="block truncate text-sm text-zinc-500">{upNext.className}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-3xl font-black text-accent">
                    {upNext.bookedCount}
                    <span className="text-sm font-semibold text-zinc-500"> / {upNext.capacity}</span>
                  </span>
                  <span className="text-xs font-bold text-accent">Open roster →</span>
                </span>
              </Link>
            ) : (
              <Card className="text-sm text-zinc-500">All of today&apos;s classes are done.</Card>
            )}
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {today.map((s) => {
                const isNext = upNext && s.classId === upNext.classId && s.date === upNext.date;
                const past = toMin(s.startTime) + SESSION_MIN <= nowMin;
                return (
                  <Link
                    key={`${s.classId}|${s.date}`}
                    href={sessionHref(s)}
                    className={`flex w-[4.5rem] shrink-0 flex-col items-center rounded-2xl border py-2 ${
                      isNext
                        ? 'border-accent bg-accent text-accent-foreground'
                        : past
                          ? 'border-transparent text-zinc-400 dark:text-zinc-600'
                          : 'border-black/[.06] bg-card text-black dark:border-white/10 dark:text-zinc-100'
                    }`}
                  >
                    <span className="text-sm font-extrabold">{formatClassTime(s.startTime)}</span>
                    <span className={`text-xs font-semibold ${isNext ? 'opacity-90' : 'text-zinc-500'}`}>
                      {s.bookedCount}/{s.capacity}
                    </span>
                  </Link>
                );
              })}
            </div>
          </div>
        )}
        {toMark.length > 0 && (
          <Link href={sessionHref(toMark[0])} className="mt-2 flex items-center gap-2 text-sm font-bold text-warning">
            <CalendarCheck className="h-4 w-4" />
            {toMark.length} past session{toMark.length === 1 ? '' : 's'} still to mark attendance
          </Link>
        )}
      </div>

      {/* ---- To do ---- */}
      <div>
        <SectionLabel>To do{groups.length > 0 ? ` · ${groups.length}` : ''}</SectionLabel>
        <Card className="!py-1">
          {groups.length === 0 ? (
            <p className="py-3 text-sm text-zinc-500">All clear. Nothing needs you right now. ✓</p>
          ) : (
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {groups.map((g) => (
                <TodoRow key={g.key} group={g} open={openKey === g.key} onToggle={() => setOpenKey(openKey === g.key ? null : g.key)} />
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ---- Members to check in on ---- */}
      {data.toCheck.length > 0 && (
        <div>
          <SectionLabel>Members to check in on · {data.toCheck.length}</SectionLabel>
          <div className={showAllToCheck ? 'grid grid-cols-2 gap-2.5 sm:grid-cols-3' : '-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-6 sm:px-6 [&::-webkit-scrollbar]:hidden'}>
            {(showAllToCheck ? data.toCheck : data.toCheck.slice(0, 12)).map((m) => (
              <div key={m.clientId} className={`${showAllToCheck ? '' : 'w-40 shrink-0'} rounded-2xl border border-black/[.06] bg-card p-3 dark:border-white/10`}>
                <Link href={`/coach/clients/${m.clientId}`} className="block">
                  <Avatar name={m.name} size="md" />
                  <span className="mt-2 block truncate text-sm font-bold text-black dark:text-zinc-50">{m.name}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {m.reasons.map((r) => (
                      <span
                        key={r.kind}
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          r.kind === 'quiet' ? 'bg-danger/15 text-danger' : r.kind === 'stalled' ? 'bg-accent/15 text-accent' : 'bg-warning/15 text-warning'
                        }`}
                      >
                        {r.label}
                      </span>
                    ))}
                  </span>
                  <span className="mt-1.5 block truncate text-[11px] text-zinc-500">{m.detail}</span>
                </Link>
                <Link
                  href={`/coach/clients/${m.clientId}?open=messages`}
                  className="mt-2 flex items-center justify-center gap-1 rounded-full bg-accent/15 py-1.5 text-xs font-bold text-accent"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Message
                </Link>
              </div>
            ))}
          </div>
          {data.toCheck.length > 12 && (
            <button type="button" onClick={() => setShowAllToCheck((v) => !v)} className="mt-2 px-1 text-sm font-bold text-accent">
              {showAllToCheck ? 'Show fewer' : `See all ${data.toCheck.length}`}
            </button>
          )}
        </div>
      )}

      {/* ---- This week ---- */}
      <div>
        <SectionLabel>This week · {scopeLabel}</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <Link href="/coach/classes?tab=sessions" className="block rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
            <p className="text-2xl font-black text-black dark:text-zinc-50">{stats.sessionsAttended}</p>
            <p className="text-xs text-zinc-500">sessions attended</p>
            {stats.sessionsAttendedLastWeek > 0 || stats.sessionsAttended > 0 ? (
              <p className={`mt-0.5 text-[11px] font-bold ${deltaLast >= 0 ? 'text-success' : 'text-danger'}`}>
                {deltaLast >= 0 ? '▲' : '▼'} {Math.abs(deltaLast)} vs last week
              </p>
            ) : null}
          </Link>
          <Link href="/coach/classes?tab=reports" className="block rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
            <p className="text-2xl font-black text-black dark:text-zinc-50">{stats.avgFillPct != null ? `${stats.avgFillPct}%` : '—'}</p>
            <p className="text-xs text-zinc-500">average class fill, all classes</p>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${stats.avgFillPct ?? 0}%` }} />
            </div>
          </Link>
          <Link href="/coach/clients" className="block rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
            <p className="text-2xl font-black text-black dark:text-zinc-50">
              {stats.checkinsIn}
              <span className="text-sm font-semibold text-zinc-500"> / {stats.checkinsOf}</span>
            </p>
            <p className="text-xs text-zinc-500">members checked in</p>
            <div className="mt-2 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
              <div className="h-full rounded-full bg-accent" style={{ width: `${checkinPct}%` }} />
            </div>
          </Link>
          <Link href="/coach/clients" className="block rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
            <p className="text-2xl font-black text-black dark:text-zinc-50">{stats.newMembers}</p>
            <p className="text-xs text-zinc-500">new member{stats.newMembers === 1 ? '' : 's'}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-zinc-500">{stats.membersTotal} members in total</p>
          </Link>
        </div>
      </div>

      {/* Quick add, phone only (wide screens have the Add client card beside this). */}
      <button
        type="button"
        aria-label="Add a member"
        onClick={() => setAdding(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl lg:hidden"
      >
        <Plus className="h-7 w-7" />
      </button>
      {adding && (
        <BottomSheet title="Add a member" onClose={() => setAdding(false)}>
          <AddClientForm />
          <JoinLinkCard />
          <Link href="/coach/messages" className="mt-4 flex items-center gap-2 border-t border-black/[.06] pt-4 text-sm font-bold text-accent dark:border-white/10">
            <Users className="h-4 w-4" /> Send a broadcast to members
          </Link>
        </BottomSheet>
      )}
    </div>
  );
}
