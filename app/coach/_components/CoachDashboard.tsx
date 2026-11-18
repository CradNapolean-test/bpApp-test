'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import {
  BellOff,
  CalendarCheck,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Dumbbell,
  FileText,
  Flag,
  MessageSquare,
  Plus,
  Search,
  Trophy,
  Utensils,
  Users,
} from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { useAction } from '@/app/_components/useAction';
import { challengeReviewKind } from '@/lib/challengeCheckins';
import { markReviewed } from '@/lib/data/coachReviews';
import { markAllReviewed } from '@/lib/data/coachDashboard';
import { THIN_WEEK_DAYS, checkinRowHint as checkinHint, saveCheckinQueue } from '@/lib/checkinQueue';
import { formatClassTime, formatLongDate } from '@/lib/utils/dates';
import CountUp from '@/app/_components/motion/CountUp';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { useSlidingThumb } from '@/app/_components/motion/useSlidingThumb';
import ClickSpark, { type ClickSparkHandle } from '@/app/_components/motion/ClickSpark';
import { foldAway, pop } from '@/app/_components/motion/gsap';
import { CoachPageHeader, CoachSection, CoachStatStrip, coachBtnOutline, coachBtnPrimary, coachBtnSoft, coachLink, coachRow } from './CoachUi';
import { SESSION_MIN, currentAndNext, minuteOfDayIn, toMinutes as toMin, todayAtGym } from '@/lib/todaySessions';
import type { CheckReason, CoachDashboardData, DashboardScope } from '@/lib/data/coachDashboard';
import type { ScheduleOccurrence } from '@/lib/data/types';
import { ActiveGymTag } from './ActiveGymTag';
import { AddClientForm } from './AddClientForm';
import { JoinLinkCard } from './JoinLinkCard';

// Reason chips in "Members to check in on" (and on Clients → Check in on).
const REASON_CLS: Record<CheckReason, string> = {
  quiet: 'bg-danger/15 text-danger',
  classes: 'bg-danger/15 text-danger',
  missed: 'bg-warning/15 text-warning',
  credits: 'bg-warning/15 text-warning',
  stalled: 'bg-accent/15 text-accent',
};

const sessionHref = (o: ScheduleOccurrence) => `/coach/classes?tab=sessions&date=${o.date}&class=${o.classId}`;
const runHref = (o: ScheduleOccurrence) => `/coach/run/${o.classId}/${o.date}`;
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
  // A second, quieter list under the main one (weeks with only a day or two logged), with one button to mark them all reviewed.
  extra?: { label: string; items: TodoItem[]; markAll?: () => Promise<{ ok: boolean }> };
  // Runs as one of the group's rows is opened (the check-ins save their order for the week page's "next" link).
  onOpen?: () => void;
}

// Nothing left to do. When the coach has just cleared the list (the page opened with things to do), the tick pops and throws a few
// sparks (React Bits ClickSpark); on a day that started clear it simply says so.
function AllClear({ celebrate }: { celebrate: boolean }) {
  const sparks = useRef<ClickSparkHandle>(null);
  const area = useRef<HTMLParagraphElement>(null);
  const tick = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!celebrate) return;
    pop(tick.current, 0.4);
    const box = area.current?.getBoundingClientRect();
    const at = tick.current?.getBoundingClientRect();
    if (box && at) sparks.current?.spark(at.left - box.left + at.width / 2, at.top - box.top + at.height / 2);
  }, [celebrate]);
  return (
    <ClickSpark ref={sparks} clickToSpark={false} sparkColor={['#19adb1', '#5fd6d6', '#f59e0b']} sparkCount={12} sparkRadius={40} sparkSize={10} shape="star" duration={700}>
      <p ref={area} className={`${coachRow} py-4 text-sm text-zinc-500`}>
        All clear. Nothing needs you right now.{' '}
        <span ref={tick} className="inline-block font-bold text-accent">
          ✓
        </span>
      </p>
    </ClickSpark>
  );
}

function TodoRow({ group, open, onToggle }: { group: TodoGroup; open: boolean; onToggle: () => void }) {
  const Icon = group.icon;
  const tone = TONE[group.tone];
  const { run, busy } = useAction();
  const single = group.direct && group.items.length === 1;
  const renderItem = (item: TodoItem) => (
    <li key={item.key} className="flex items-center gap-2 rounded-xl bg-black/[.03] px-3 py-2 dark:bg-white/[.04]">
      <Link href={item.href} onClick={group.onOpen} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-black dark:text-zinc-50">{item.title}</span>
        {/* Two lines, not one cut short: on a phone "Week of 26 Oct · 7 days logged · no food" lost the "no food" (DB22, CW18). */}
        <span className="line-clamp-2 text-xs text-zinc-500">{item.hint}</span>
      </Link>
      {item.review && (
        <button
          type="button"
          disabled={busy}
          onClick={(e) => {
            const row = e.currentTarget.closest('li');
            void foldAway(row, () => run(async () => item.review!(), { success: 'Marked as reviewed' }));
          }}
          className="h-9 shrink-0 rounded-xl bg-accent-soft px-3 text-[13px] font-bold text-accent disabled:opacity-50"
        >
          Reviewed
        </button>
      )}
      <Link href={item.href} onClick={group.onOpen} aria-label="Open" className="shrink-0 text-zinc-400">
        <ChevronRight className="h-4 w-4" />
      </Link>
    </li>
  );
  const header = (
    <>
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-base font-extrabold ${tone.chip}`}>
        <CountUp to={group.count ?? group.items.length} duration={0.6} />
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5 text-[15px] font-bold text-black dark:text-zinc-50">
          <Icon className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
          <span className="truncate">{group.title}</span>
        </span>
        {/* Two lines, not one cut short (DB22). */}
        <span className="line-clamp-2 text-[13px] text-zinc-500 dark:text-zinc-400">{group.summary}</span>
      </span>
      <span aria-hidden className={`${coachBtnSoft} hidden shrink-0 sm:inline-flex`}>
        {single ? 'Open' : open ? 'Close' : 'Review'}
      </span>
      {single ? (
        <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400 sm:hidden" />
      ) : (
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform sm:hidden ${open ? 'rotate-180' : ''}`} />
      )}
    </>
  );
  return (
    <div data-stagger className={coachRow}>
      {single ? (
        <Link href={group.items[0].href} className="flex min-h-[64px] items-center gap-3 py-3">
          {header}
        </Link>
      ) : (
        <button type="button" onClick={onToggle} aria-expanded={open} className="flex min-h-[64px] w-full items-center gap-3 py-3">
          {header}
        </button>
      )}
      {open && !single && group.items.length > 0 && <ul className="mb-3 ml-14 space-y-1.5">{group.items.map(renderItem)}</ul>}
      {open && !single && group.extra && (
        <div className="mb-3 ml-14">
          <div className="flex items-center justify-between gap-2 px-1 pb-1.5 pt-1">
            <p className="text-xs font-bold text-zinc-500">{group.extra.label}</p>
            {group.extra.markAll && (
              <button
                type="button"
                disabled={busy}
                onClick={() => run(async () => group.extra!.markAll!(), { success: 'Marked as reviewed' })}
                className="h-9 shrink-0 rounded-lg px-2.5 text-[13px] font-bold text-accent disabled:opacity-50"
              >
                Mark all reviewed
              </button>
            )}
          </div>
          <ul className="space-y-1.5">{group.extra.items.map(renderItem)}</ul>
        </div>
      )}
    </div>
  );
}

export function CoachDashboard({ data, activity }: { data: CoachDashboardData; activity?: ReactNode }) {
  const router = useRouter();
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [showAllToCheck, setShowAllToCheck] = useState(false);
  // The booking bars and the week's bars fill when the dashboard opens.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.25);
  // The to-do groups settle in when the dashboard opens.
  useStaggerIn(screen, '[data-stagger]', null, 0.2);
  const scopeTrack = useRef<HTMLDivElement>(null);
  // The highlight moves the moment a scope is tapped, not a second later when the new figures arrive: the scope tapped is shown while
  // the page still holds the one it was tapped from.
  const [picked, setPicked] = useState<{ key: DashboardScope; from: DashboardScope } | null>(null);
  const shownScope = picked && picked.from === data.scope ? picked.key : data.scope;
  useSlidingThumb(scopeTrack, shownScope);
  // "Happening now / Up next" follows the gym's clock: it used to be worked out once, when the page loaded, and then sat there (CC3).
  const [clockMs, setClockMs] = useState(() => Date.now());
  useEffect(() => {
    const tick = setInterval(() => setClockMs(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, []);
  const { scope, isAdmin, coaches, selectedCoachId, stats } = data;
  const own = (mineFlag: boolean) => scope === 'mine' || mineFlag;

  // ---- To do ----
  const groups: TodoGroup[] = [];

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
          href: '/coach/classes?tab=reports&section=red-flags',
        },
      ],
    });
  }

  // D19: 3 check-in reminders unanswered, so the reminders have stopped and it is the coach's turn.
  if (data.remindersUnanswered.length > 0) {
    const n = data.remindersUnanswered.length;
    groups.push({
      key: 'reminders',
      icon: BellOff,
      tone: 'urgent',
      title: 'Check-in reminders unanswered',
      summary: `${n} member${n === 1 ? '' : 's'} did not answer 3 reminders, so the app has stopped sending them`,
      items: data.remindersUnanswered.map((r) => ({
        key: `${r.clientId}|${r.stoppedOn}`,
        clientId: r.clientId,
        title: r.name,
        hint: `3 reminders unanswered · ${r.lastLog ? `last log ${dayShort(r.lastLog)}` : 'nothing logged in 4 weeks'} · stopped ${dayShort(r.stoppedOn)}`,
        href: `/coach/clients/${r.clientId}?open=messages`,
        review: own(r.mine) ? () => markReviewed('checkin_reminders', r.clientId, r.stoppedOn) : undefined,
      })),
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

  // Week 3 of a fixed-length plan (the 6 week challenge), and from 10 days before it ends (D5): the second is about what they do next, so
  // it opens the member, not just the messages.
  if (data.challengeDue.length > 0) {
    const ending = data.challengeDue.filter((c) => c.milestone === 'final').length;
    const daysLeftText = (c: (typeof data.challengeDue)[number]) =>
      c.daysLeft == null ? '' : c.daysLeft === 0 ? 'last day today' : `${c.daysLeft} day${c.daysLeft === 1 ? '' : 's'} left`;
    groups.push({
      key: 'challenge',
      icon: Trophy,
      tone: 'amber',
      title: 'Challenge check-ins due',
      summary: `${data.challengeDue.length} member${data.challengeDue.length === 1 ? '' : 's'} on the challenge to check in with${ending > 0 ? ` (${ending} ending soon: talk about what's next)` : ''}`,
      items: data.challengeDue.map((c) => ({
        key: `${c.membershipId}|${c.milestone}`,
        clientId: c.clientId,
        title: c.name,
        hint:
          c.milestone === 'final'
            ? [`${c.planName} ends${c.endsOn ? ` ${dayShort(c.endsOn)}` : ' this week'}`, daysLeftText(c), "what's next?"].filter(Boolean).join(' · ')
            : [`Week ${c.week} of ${c.totalWeeks}`, c.planName, daysLeftText(c)].filter(Boolean).join(' · '),
        href: c.milestone === 'final' ? `/coach/clients/${c.clientId}` : `/coach/clients/${c.clientId}?open=messages`,
        review: own(c.mine) ? () => markReviewed(challengeReviewKind(c.milestone), c.clientId, c.membershipId) : undefined,
      })),
    });
  }

  // Programmes ending within 7 days, or already finished, with nothing scheduled next (D2). It clears itself once the next
  // programme is scheduled, so there is no Reviewed button.
  if (data.programmesEnding.length > 0) {
    const finished = data.programmesEnding.filter((p) => p.daysLeft < 0).length;
    const ending = data.programmesEnding.length - finished;
    groups.push({
      key: 'programmes',
      icon: Dumbbell,
      tone: 'amber',
      title: 'Programmes ending',
      summary: [finished > 0 ? `${finished} finished` : '', ending > 0 ? `${ending} ending within 7 days` : ''].filter(Boolean).join(' · '),
      items: data.programmesEnding.map((p) => ({
        key: p.clientId,
        clientId: p.clientId,
        title: p.name,
        hint: `${p.programName} · ${p.line}`,
        href: `/coach/clients/${p.clientId}?open=training`,
      })),
    });
  }

  if (data.checkins.length > 0) {
    // Newest week first, then by name; weeks with only a day or two logged go in their own list underneath (UX5).
    const sorted = [...data.checkins].sort((a, b) => b.weekStart.localeCompare(a.weekStart) || a.name.localeCompare(b.name));
    const full = sorted.filter((c) => c.days > THIN_WEEK_DAYS);
    const thin = sorted.filter((c) => c.days <= THIN_WEEK_DAYS);
    const toItem = (c: (typeof sorted)[number]): TodoItem => ({
      key: `${c.clientId}|${c.weekStart}`,
      clientId: c.clientId,
      title: c.name,
      hint: checkinHint(c),
      href: `/coach/clients/${c.clientId}?open=checkin&week=${c.weekStart}`,
      review: own(c.mine) ? () => markReviewed('week', c.clientId, c.weekStart) : undefined,
    });
    // The order the week page's "Next check-in" link follows: the same order as on screen.
    const queue = [...full, ...thin].map((c) => ({ clientId: c.clientId, weekStart: c.weekStart, name: c.name, hint: checkinHint(c), href: toItem(c).href }));
    const ownThin = thin.filter((c) => own(c.mine));
    const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
    groups.push({
      key: 'checkins',
      icon: Check,
      tone: 'green',
      title: 'Weekly check-ins to review',
      summary:
        full.length > 0
          ? `${plural(full.length, 'week', 'weeks')} to read${thin.length > 0 ? ` · ${thin.length} with only 1 or 2 days logged` : ''}`
          : `${plural(thin.length, 'week', 'weeks')} with only 1 or 2 days logged`,
      count: data.checkins.length,
      items: full.map(toItem),
      extra:
        thin.length > 0
          ? {
              label: 'Only 1 or 2 days logged',
              items: thin.map(toItem),
              // One database call for the lot, not one per week.
              markAll: ownThin.length > 0 ? () => markAllReviewed('week', ownThin.map((c) => ({ clientId: c.clientId, ref: c.weekStart }))) : undefined,
            }
          : undefined,
      onOpen: () => saveCheckinQueue(queue),
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
        review: own(p.mine) ? () => markAllReviewed('diary_day', p.dates.map((d) => ({ clientId: p.clientId, ref: d }))) : undefined,
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
  // The gym's clock and the gym's date, so a page left open past midnight moves on to the new day's sessions.
  const now = new Date(clockMs);
  const nowMin = minuteOfDayIn(data.timezone, now);
  const gymToday = todayAtGym(data.timezone, now);
  const today = data.occurrences.filter((o) => o.date === gymToday).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const { inProgress } = currentAndNext(today, nowMin);
  const toMark = data.occurrences.filter((o) => (o.unmarkedCount ?? 0) > 0);

  const scopeHref = (s: DashboardScope, coachId?: string) => `/coach?scope=${s}${coachId ? `&coach=${coachId}` : ''}`;
  const scopeLabel = scope === 'gym' ? 'the whole gym' : scope === 'coach' ? coaches.find((c) => c.id === selectedCoachId)?.name ?? 'this coach' : 'your members';

  const deltaLast = stats.sessionsAttended - stats.sessionsAttendedSameTimeLastWeek;
  const checkinPct = stats.checkinsOf > 0 ? Math.round((stats.checkinsIn / stats.checkinsOf) * 100) : 0;
  // "7 / 12 checked in" next to "14 members in total": the 12 leaves out members still setting up, so say so (UX2).
  const notSetUp = Math.max(0, stats.membersTotal - stats.checkinsOf);

  // ---- Figures for the strip ----
  const pastOf = (s: ScheduleOccurrence) => toMin(s.startTime) + SESSION_MIN <= nowMin;
  const doneToday = today.filter(pastOf).length;
  const bookedToday = today.reduce((n, s) => n + s.bookedCount, 0);
  const capacityToday = today.reduce((n, s) => n + s.capacity, 0);
  const needsYou = groups.reduce((n, g) => n + (g.count ?? g.items.length), 0);
  // Whether there were things to do when the page opened: clearing the last one then gets a small celebration (not on a quiet day).
  const [startedWithTodos] = useState(() => needsYou > 0);
  const quietCount = data.toCheck.filter((m) => m.reasons.some((r) => r.kind === 'quiet')).length;
  const greeting = (() => {
    const h = Number(now.toLocaleTimeString('en-GB', { hour: '2-digit', hour12: false, timeZone: data.timezone }));
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  })();
  const clockLine = `${formatLongDate(now, { timeZone: data.timezone })}, ${now
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: data.timezone })
    .replace(' ', ' ')}`;
  const toCheckShown = showAllToCheck ? data.toCheck : data.toCheck.slice(0, 6);

  return (
    <div ref={screen} className="space-y-6 pb-20 lg:pb-0">
      <CoachPageHeader
        eyebrow={clockLine}
        title={`${greeting}, ${data.firstName || 'Coach'}`}
        actions={
          <>
            <FindMember names={data.nameById} />
            {isAdmin && (
              <div ref={scopeTrack} role="group" aria-label="Whose members" className="relative flex rounded-xl bg-black/[.06] p-1 dark:bg-white/10">
                <span data-thumb-el aria-hidden className="pointer-events-none absolute left-0 top-0 rounded-lg bg-card shadow-sm" />
                {([
                  ['mine', 'My members'],
                  ['gym', 'Whole gym'],
                  ['coach', 'By coach'],
                ] as [DashboardScope, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={shownScope === key}
                    data-active={shownScope === key}
                    onClick={() => {
                      if (key !== scope) setPicked({ key, from: scope });
                      router.push(key === 'coach' ? scopeHref('coach', selectedCoachId ?? coaches[0]?.id) : scopeHref(key));
                    }}
                    className={`relative h-9 whitespace-nowrap rounded-lg px-3 text-sm font-bold transition-colors ${
                      shownScope === key ? 'bg-card text-black shadow-sm dark:text-zinc-50' : 'text-zinc-600 hover:text-black dark:text-zinc-300'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
            {/* From a tablet up; a phone has the round + button at the foot. */}
            <span className="hidden sm:block">
              <button type="button" onClick={() => setAdding(true)} className={coachBtnPrimary}>
                <Plus className="h-4 w-4" strokeWidth={2.6} /> Add member
              </button>
            </span>
          </>
        }
      />
      {isAdmin && scope !== 'mine' && (
        <div className="space-y-2">
          {scope === 'coach' && coaches.length > 0 && (
            <select
              value={selectedCoachId ?? ''}
              onChange={(e) => router.push(scopeHref('coach', e.target.value))}
              aria-label="Coach"
              className="h-11 w-full max-w-sm rounded-xl border border-black/[.16] bg-card px-3 text-base dark:border-white/15"
            >
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <p className="text-sm text-zinc-500">
              Showing {scopeLabel}. Messages and the actions that need the member&apos;s own coach (marking things reviewed) stay with that coach.
            </p>
        </div>
      )}

      <CoachStatStrip
        label="Today at a glance"
        stats={[
          {
            label: 'Sessions today',
            value: <CountUp to={today.length} />,
            sub: today.length === 0 ? 'None scheduled' : `${doneToday} done${inProgress ? ', 1 on now' : ''}`,
          },
          {
            label: 'Booked',
            value: (
              <>
                <CountUp to={bookedToday} />
                <span className="text-lg font-bold text-zinc-500"> / {capacityToday}</span>
              </>
            ),
            sub: capacityToday > 0 ? `${Math.round((bookedToday / capacityToday) * 100)}% full` : 'No places today',
          },
          {
            label: 'Needs you',
            value: <CountUp to={needsYou} />,
            sub: groups.length === 0 ? 'All clear' : `In ${groups.length} list${groups.length === 1 ? '' : 's'} below`,
            tone: needsYou > 0 ? 'amber' : undefined,
          },
          {
            label: 'To check in on',
            value: <CountUp to={data.toCheck.length} />,
            sub: quietCount > 0 ? `${quietCount} ${quietCount === 1 ? 'has' : 'have'} gone quiet` : data.toCheck.length > 0 ? 'See them below' : 'Everyone is on track',
          },
        ]}
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-6">
          {/* ---- Today on the floor ---- */}
          <CoachSection
            title={
              <>
                Today on the floor
                <ActiveGymTag />
              </>
            }
            action={
              <Link href="/coach/classes?tab=sessions" className={coachLink}>
                Open timetable
              </Link>
            }
          >
            {today.length === 0 ? (
              <p className={`${coachRow} py-4 text-sm text-zinc-500`}>No classes scheduled today.</p>
            ) : (
              <ul>
                {today.map((s) => {
                  const onNow = inProgress != null && s.classId === inProgress.classId && s.date === inProgress.date;
                  const past = !onNow && pastOf(s);
                  const left = s.capacity - s.bookedCount;
                  const pct = s.capacity > 0 ? Math.min(100, (s.bookedCount / s.capacity) * 100) : 0;
                  return (
                    <li key={`${s.classId}|${s.date}`} className={`${coachRow} flex min-h-[64px] flex-wrap items-center gap-x-4 gap-y-2 py-3`}>
                      <span className={`w-16 shrink-0 text-[15px] font-extrabold ${past ? 'text-zinc-400' : 'text-black dark:text-zinc-50'}`}>{formatClassTime(s.startTime)}</span>
                      <span className="min-w-0 flex-1 basis-40">
                        <span className="flex items-center gap-2">
                          <Link href={sessionHref(s)} className="truncate text-[15px] font-bold text-black hover:underline dark:text-zinc-50">
                            {s.className}
                          </Link>
                          {onNow && <span className="shrink-0 rounded-full bg-accent px-2 py-0.5 text-[11px] font-extrabold text-accent-foreground">On now</span>}
                        </span>
                        <span className="block truncate text-[13px] text-zinc-500 dark:text-zinc-400">
                          {past
                            ? `${s.bookedCount} booked`
                            : left <= 0
                              ? `Full${s.waitlistCount ? ` · ${s.waitlistCount} waiting` : ''}`
                              : `${left} spot${left === 1 ? '' : 's'} left`}
                          {s.coachNote ? ` · ${s.coachNote}` : ''}
                        </span>
                      </span>
                      <span className="flex w-36 shrink-0 items-center gap-2.5">
                        <span className="h-2 flex-1 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${s.bookedCount} of ${s.capacity} booked`}>
                          <span data-grow="bar" className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                        </span>
                        <span className="w-12 text-right text-[13px] font-bold text-black dark:text-zinc-50">
                          {s.bookedCount} / {s.capacity}
                        </span>
                      </span>
                      <span className="flex shrink-0 justify-end sm:w-40">
                        {onNow ? (
                          <Link href={runHref(s)} className={coachBtnPrimary}>
                            Run this class
                          </Link>
                        ) : past ? (
                          (s.unmarkedCount ?? 0) > 0 ? (
                            <Link href={sessionHref(s)} className={coachBtnSoft}>
                              Mark attendance
                            </Link>
                          ) : (
                            <span className="text-[13px] font-semibold text-zinc-500">Done</span>
                          )
                        ) : (
                          <Link href={sessionHref(s)} className={coachBtnOutline}>
                            Open roster
                          </Link>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            {toMark.length > 0 && (
              <Link href={sessionHref(toMark[0])} className={`${coachRow} flex items-center gap-2 py-3 text-sm font-bold text-warning`}>
                <CalendarCheck className="h-4 w-4" />
                {toMark.length} past session{toMark.length === 1 ? '' : 's'} still to mark attendance
              </Link>
            )}
          </CoachSection>

          {/* ---- Needs you (the to-do lists) ---- */}
          <CoachSection title="Needs you" count={needsYou > 0 ? needsYou : undefined} action={groups.length > 0 ? <span className="text-[13px] font-semibold text-zinc-500">Most urgent first</span> : undefined}>
            {groups.length === 0 ? (
              <AllClear celebrate={startedWithTodos} />
            ) : (
              <div>
                {groups.map((g) => (
                  <TodoRow key={g.key} group={g} open={openKey === g.key} onToggle={() => setOpenKey(openKey === g.key ? null : g.key)} />
                ))}
              </div>
            )}
          </CoachSection>
        </div>

        <div className="min-w-0 space-y-6">
          {/* ---- Check in on: the same list, with the same reasons, as Clients → Check in on (CL16) ---- */}
          <CoachSection
            title="Check in on"
            count={data.toCheck.length > 0 ? data.toCheck.length : undefined}
            action={
              scope !== 'coach' && data.toCheck.length > 0 ? (
                <Link href={`/coach/clients?filter=check${scope === 'gym' ? '&scope=gym' : ''}`} className={coachLink}>
                  See all
                </Link>
              ) : undefined
            }
          >
            {data.toCheck.length === 0 ? (
              <p className={`${coachRow} py-4 text-sm text-zinc-500`}>Everyone is on track.</p>
            ) : (
              <ul>
                {toCheckShown.map((m) => (
                  <li key={m.clientId} className={`${coachRow} flex min-h-[60px] items-center gap-3 py-2`}>
                    <Avatar name={m.name} size="md" />
                    <Link href={`/coach/clients/${m.clientId}`} className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-bold text-black hover:underline dark:text-zinc-50">{m.name}</span>
                      <span className="flex flex-wrap items-center gap-1">
                        {m.reasons.map((r) => (
                          <span key={r.kind} className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${REASON_CLS[r.kind]}`}>
                            {r.label}
                          </span>
                        ))}
                      </span>
                    </Link>
                    <Link
                      href={`/coach/clients/${m.clientId}?open=messages`}
                      aria-label={`Message ${m.name}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent"
                    >
                      <MessageSquare className="h-[18px] w-[18px]" />
                    </Link>
                  </li>
                ))}
                {data.toCheck.length > 6 && (
                  <li className={coachRow}>
                    <button type="button" onClick={() => setShowAllToCheck((v) => !v)} className={`${coachLink} min-h-11`}>
                      {showAllToCheck ? 'Show fewer' : `Show all ${data.toCheck.length}`}
                    </button>
                  </li>
                )}
              </ul>
            )}
          </CoachSection>

          {activity}

          {/* ---- This week ---- */}
          <CoachSection title="This week" action={<span className="text-[13px] font-semibold text-zinc-500">{scopeLabel}</span>} bodyClassName="grid grid-cols-2 gap-px border-t border-black/[.07] bg-black/[.07] dark:border-white/10 dark:bg-white/10">
            <Link href="/coach/classes?tab=sessions" className="block bg-card px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
              <p className="text-2xl font-extrabold text-black dark:text-zinc-50">{stats.sessionsAttended}</p>
              <p className="text-[13px] text-zinc-500">sessions attended</p>
              {stats.sessionsAttendedSameTimeLastWeek > 0 || stats.sessionsAttended > 0 ? (
                <p className={`mt-0.5 text-xs font-bold ${deltaLast === 0 ? 'text-zinc-500' : deltaLast > 0 ? 'text-success' : 'text-danger'}`}>
                  {deltaLast === 0 ? 'Same as' : `${deltaLast > 0 ? '▲' : '▼'} ${Math.abs(deltaLast)} vs`} this time last week
                </p>
              ) : null}
            </Link>
            {/* Fill is about which sessions are full or empty: the Busiest report, not the Red flags list it used to open on (UX3). */}
            <Link href="/coach/classes?tab=reports&section=busiest" className="block bg-card px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
              <p className="text-2xl font-extrabold text-black dark:text-zinc-50">{stats.avgFillPct != null ? `${stats.avgFillPct}%` : '—'}</p>
              <p className="text-[13px] text-zinc-500">average class fill</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div data-grow="bar" className="h-full rounded-full bg-accent" style={{ width: `${stats.avgFillPct ?? 0}%` }} />
              </div>
            </Link>
            <Link href="/coach/clients" className="block bg-card px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
              <p className="text-2xl font-extrabold text-black dark:text-zinc-50">
                {stats.checkinsIn}
                <span className="text-sm font-semibold text-zinc-500"> / {stats.checkinsOf}</span>
              </p>
              <p className="text-[13px] text-zinc-500">members checked in</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
                <div data-grow="bar" className="h-full rounded-full bg-accent" style={{ width: `${checkinPct}%` }} />
              </div>
              {notSetUp > 0 && <p className="mt-1 text-xs font-semibold text-zinc-500">{notSetUp} not set up yet</p>}
            </Link>
            <Link href="/coach/clients" className="block bg-card px-5 py-4 hover:bg-black/[.02] dark:hover:bg-white/[.03]">
              <p className="text-2xl font-extrabold text-black dark:text-zinc-50">{stats.newMembers}</p>
              {/* "Joined", so it can't be read against "New members to review", which counts members waiting for a look (UX2). */}
              <p className="text-[13px] text-zinc-500">joined this week</p>
              <p className="mt-0.5 text-xs font-semibold text-zinc-500">{stats.membersTotal} members in total</p>
            </Link>
          </CoachSection>
        </div>
      </div>

      {/* Quick add, phone only (from a tablet up it is the Add member button in the header). */}
      <button
        type="button"
        aria-label="Add a member"
        onClick={() => setAdding(true)}
        className="fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xl sm:hidden"
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

// "Find a member": the names this dashboard already has, matched as they are typed, each opening that member.
function FindMember({ names }: { names: Record<string, string> }) {
  const [q, setQ] = useState('');
  const term = q.trim().toLowerCase();
  const matches = term
    ? Object.entries(names)
        .filter(([, n]) => n.toLowerCase().includes(term))
        .sort((a, b) => a[1].localeCompare(b[1]))
        .slice(0, 6)
    : [];
  return (
    <div className="relative w-full sm:w-64">
      <label className="flex h-11 items-center gap-2 rounded-xl border border-black/[.16] bg-card px-3 dark:border-white/15">
        <Search className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden />
        <span className="sr-only">Find a member</span>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a member"
          className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-zinc-500"
        />
      </label>
      {term && (
        <ul className="absolute inset-x-0 top-12 z-20 overflow-hidden rounded-xl border border-black/[.08] bg-card py-1 shadow-xl dark:border-white/10">
          {matches.length === 0 ? (
            <li className="px-3 py-2.5 text-sm text-zinc-500">No member called that.</li>
          ) : (
            matches.map(([id, n]) => (
              <li key={id}>
                <Link href={`/coach/clients/${id}`} className="flex min-h-11 items-center gap-2.5 px-3 text-[15px] font-semibold text-black hover:bg-black/[.04] dark:text-zinc-50 dark:hover:bg-white/[.06]">
                  <Avatar name={n} size="sm" />
                  {n}
                </Link>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
