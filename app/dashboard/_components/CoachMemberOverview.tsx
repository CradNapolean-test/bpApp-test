'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Beef,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FileText,
  Footprints,
  GraduationCap,
  MessageSquare,
  NotebookPen,
  UserCog,
  Wallet,
  Moon,
  Scale,
  ScanLine,
  Utensils,
} from 'lucide-react';
import { Card, IconChip, ListGroup, ListRow, SectionLabel } from '@/app/_components/ui';
import { weeklyTarget } from '@/lib/calculations';
import { getReviews } from '@/lib/data/coachReviews';
import { clearReviewFlag } from '@/lib/data/onboarding';
import { trafficLight, TRACKER_THRESHOLDS, type TrafficLight } from '@/lib/utils/accountability';
import { useAction } from '@/app/_components/useAction';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { averageDayTarget } from '@/lib/utils/dayTarget';
import { dayCaloriesOf, hasFoodLogged, hasLoggedData } from '@/lib/utils/dailyLog';
import { planCountdown, planCountdownLabel } from '@/lib/planCountdown';
import { lastActiveLabel } from '@/lib/healthStatus';
import { weightGoalProgress } from '@/lib/weightGoal';
import { calorieTone, proteinTone, splitFoodDays } from '@/lib/weekFood';
import { olderUnreviewed, olderUnreviewedLine } from '@/lib/memberReview';
import { checkinScaleTrends, CHECKIN_SCALES, trendTone, TREND_WEEKS } from '@/lib/checkinTrends';
import type { ScaleTrend } from '@/lib/checkinTrends';
import { nextBookedClass } from '@/lib/nextClass';
import { overviewNotes } from '@/lib/overviewNotes';
import { toDisabledMetricSet } from '@/lib/checkinMetrics';
import { minuteOfDayIn } from '@/lib/todaySessions';
import { addDays, formatClassTime, isoWeekKey, toIsoDate, todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { TrendChart } from './OverviewTab';
import { BigDogCard } from './BigDogTab';
import { CoachStatStrip } from '@/app/coach/_components/CoachUi';
import { formatWeight, formatWeightDiffForCoach, formatWeightForCoach, formatWeightShort, weightUnitOf } from '@/lib/utils/weightUnits';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type {
  BigDogResultRow,
  BodyScan,
  BookingRow,
  ClientJournalEntryRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  FormAssignmentWithDetails,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';
import type { Category, Screen } from './categories';

const shortDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = (iso: string) =>
  new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

const avg = (vals: (number | null | undefined)[]) => {
  const present = vals.filter((v): v is number => v != null);
  return present.length ? present.reduce((a, v) => a + v, 0) / present.length : null;
};

const TONE_CLS: Record<TrafficLight, string> = {
  green: 'text-success',
  amber: 'text-warning',
  red: 'text-danger',
};

// One number for the week. `tone` colours it green / amber / red against the gym's accountability
// thresholds; `onClick` makes the tile a shortcut.
function Tile({
  icon,
  label,
  value,
  hint,
  tone,
  onClick,
}: {
  icon: typeof Check;
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: TrafficLight | null;
  onClick?: () => void;
}) {
  const body = (
    <>
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
        <IconChip icon={icon} size="sm" /> {label}
      </p>
      <p className={`mt-1.5 text-[22px] font-extrabold leading-tight ${tone ? TONE_CLS[tone] : 'text-black dark:text-zinc-50'}`}>{value}</p>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
    </>
  );
  const cls = 'rounded-[20px] border border-black/[.08] bg-card p-4 text-left dark:border-white/10';
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} hover:bg-black/[.02] dark:hover:bg-white/[.03]`}>
      {body}
    </button>
  ) : (
    <div className={cls}>{body}</div>
  );
}

const TREND_TONE_CLS = { good: 'text-success', bad: 'text-danger', neutral: 'text-zinc-500', flat: 'text-zinc-500' } as const;

// One check-in scale over the last four weeks (DB11): the newest week's average out of 5, a bar for each week (oldest first, an empty
// slot for a week with no score), and how far it has moved since the first scored week, coloured by which way is better.
function ScaleTrendCell({ trend }: { trend: ScaleTrend }) {
  const info = CHECKIN_SCALES.find((s) => s.key === trend.key);
  const tone = trendTone(trend.key, trend.change);
  const label = info?.label ?? trend.key;
  const summary =
    trend.latest == null
      ? `${label}: not scored in the last ${TREND_WEEKS} weeks`
      : `${label}: ${trend.latest.toFixed(1)} out of 5 in the latest week scored; weekly averages, oldest first, ${trend.weeks
          .map((w) => (w.avg == null ? 'none' : w.avg.toFixed(1)))
          .join(', ')}`;
  return (
    <div className="min-w-0 p-3.5" role="group" aria-label={summary}>
      <p className="text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold text-black dark:text-zinc-50">
        {trend.latest != null ? trend.latest.toFixed(1) : '—'}
        {trend.latest != null && <span className="text-xs font-bold text-zinc-500"> / 5</span>}
      </p>
      <div aria-hidden className="mt-1.5 flex h-8 items-end gap-1">
        {trend.weeks.map((w) => (
          <span key={w.weekStart} className="flex h-full flex-1 items-end">
            {w.avg != null ? (
              <span className="block w-full rounded-sm bg-accent" style={{ height: `${Math.max(12, (w.avg / 5) * 100)}%` }} />
            ) : (
              <span className="block h-1 w-full rounded-sm bg-black/10 dark:bg-white/15" />
            )}
          </span>
        ))}
      </div>
      <p className={`mt-1 text-[11px] font-semibold ${tone ? TREND_TONE_CLS[tone] : 'text-zinc-500'}`}>
        {trend.latest == null
          ? 'Not scored yet'
          : trend.change == null
            ? `${trend.days} day${trend.days === 1 ? '' : 's'} scored`
            : Math.abs(trend.change) < 0.1
              ? 'Steady'
              : `${trend.change > 0 ? '▲' : '▼'} ${Math.abs(trend.change).toFixed(1)} in ${TREND_WEEKS} weeks`}
      </p>
    </div>
  );
}

// The coach's snapshot of one member: who they are, what needs doing, how this week has gone, and
// the trends that matter (weight, body composition, training). Replaces the old overview, which
// only showed today's food and a couple of counts.
export function CoachMemberOverview({
  clientId,
  profile,
  programWeek,
  weekLogs,
  historyLogs,
  formAssignments,
  bookings,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  bodyScans,
  bigDogResults,
  journalEntries,
  healthStatus,
  isOwnClient,
  latestWeighIn = null,
  ownerCoachName = null,
  currentUserId = null,
  disabledMetrics = [],
  unreadMessages = 0,
  classTimezone,
  onNavigate,
  onOpenCheckin,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  formAssignments: FormAssignmentWithDetails[];
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  bodyScans: BodyScan[];
  bigDogResults: BigDogResultRow[];
  journalEntries: ClientJournalEntryRow[];
  healthStatus: ClientHealthStatus | null;
  isOwnClient: boolean;
  // Their most recent weigh-in however old (the logs here only go back 84 days), and the name of the coach they belong to.
  latestWeighIn?: { date: string; weight: number } | null;
  ownerCoachName?: string | null;
  // The coach looking (their own notes come first, CL15); the check-in measures switched off for this member; their unread messages to
  // this coach (DB11); and the gym's timezone, for whether a class today has started yet (CV8).
  currentUserId?: string | null;
  disabledMetrics?: string[];
  unreadMessages?: number;
  classTimezone?: string;
  onNavigate: (category: Category, screen?: Screen) => void;
  onOpenCheckin: (weekStart: string) => void;
}) {
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const thisWeek = isoWeekKey(todayIso);
  const prevWeek = toIsoDate(addDays(new Date(thisWeek + 'T00:00:00Z'), -7));
  const isPhoto = profile?.nutrition_tracking_mode === 'photo_diary';

  const [reviews, setReviews] = useState<{ week: string[]; form: string[] } | null>(null);
  useEffect(() => {
    getReviews(clientId).then(setReviews).catch(() => setReviews({ week: [], form: [] }));
  }, [clientId]);

  const logged = useMemo(() => historyLogs.filter(hasLoggedData), [historyLogs]);
  const daysIn = (weekStart: string) => {
    const end = toIsoDate(addDays(new Date(weekStart + 'T00:00:00Z'), 6));
    return logged.filter((l) => l.log_date >= weekStart && l.log_date <= end).length;
  };

  // ---- this week ----
  const weekDays = weekLogs.filter(hasLoggedData);
  const stepsAvg = avg(weekDays.map((l) => l.steps));
  const sleepAvg = avg(weekDays.map((l) => l.sleep));
  // Each average says how many of this week's days it comes from: one day of food read as a whole week's average (CR3).
  const daysSoFar = Math.min(7, Math.round((new Date(todayIso + 'T00:00:00Z').getTime() - new Date(thisWeek + 'T00:00:00Z').getTime()) / 86400000) + 1);
  const stepsDays = weekDays.filter((l) => l.steps != null).length;
  const sleepDays = weekDays.filter((l) => l.sleep != null).length;
  const fromDays = (n: number, of = daysSoFar) => (
    <span className={n < of ? 'font-semibold text-warning' : undefined}>
      {n} of {of} day{of === 1 ? '' : 's'}
    </span>
  );
  // Read against the week's average, so a calorie-cycling member's is the planned average day (low and high days together).
  const dayTarget = useMemo(() => {
    const engine = toEngineProfile(profile);
    return averageDayTarget(engine ? weeklyTarget(engine, programWeek) : null);
  }, [profile, programWeek]);
  // Calories include Quick Adds with no macros (R11), and a day whose food was all deleted is not a food day (M2). The averages use
  // full days only: not today (still going) and not a part-logged day such as a shake and nothing else (NU25).
  const foodSplit = splitFoodDays(weekDays.filter(hasFoodLogged), todayIso, thisWeek, dayTarget?.calories ?? null, dayCaloriesOf);
  const kcalAvg = avg(foodSplit.full.map(dayCaloriesOf));
  const proteinAvg = avg(foodSplit.full.map((l) => l.protein));
  const partDays = foodSplit.part.length;
  const foodHint = (target: string | null) =>
    foodSplit.completedDays === 0 ? (
      <>Counted from tomorrow{target ? <> · target {target}</> : null}</>
    ) : (
      <>
        {foodSplit.full.length > 0 ? fromDays(foodSplit.full.length, foodSplit.completedDays) : <span className="font-semibold text-warning">No full day logged</span>}
        {target && <> · target {target}</>}
        {partDays > 0 && (
          <span className="block">
            {partDays} part-logged day{partDays === 1 ? '' : 's'} left out
          </span>
        )}
      </>
    );
  const attendedThisWeek = bookings.filter((b) => b.attended && b.booking_date >= thisWeek).length;
  const perWeek = membership?.package?.credits_per_week ?? null;
  const loggedWorkoutDays = new Set(workoutLogs.filter((w) => w.logged_at.slice(0, 10) >= thisWeek).map((w) => w.logged_at.slice(0, 10))).size;
  const lastWorkout = workoutLogs.map((w) => w.logged_at.slice(0, 10)).sort().at(-1) ?? null;
  // The next class still to come: one earlier today no longer counts once it has started (CV8). By the gym's clock and calendar, the
  // times classes are set in.
  const classTz = classTimezone ?? profile?.timezone ?? DEFAULT_TIMEZONE;
  const nextClass = nextBookedClass(bookings, todayIsoInTz(classTz), minuteOfDayIn(classTz, new Date()));

  // ---- weight ----
  const weights = logged.filter((l) => l.bodyweight != null).sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  // The last weigh-in in the 84 days of logs, else their latest ever (a member who last weighed in three months ago still has a weight).
  const nowWeight = weights.at(-1)?.bodyweight ?? latestWeighIn?.weight ?? null;
  const nowWeightDate = weights.at(-1)?.log_date ?? latestWeighIn?.date ?? null;
  const start = profile?.start_weight ?? null;
  const goal = profile?.goal_weight ?? null;
  const progress = start != null && goal != null && nowWeight != null ? weightGoalProgress(start, goal, nowWeight) : null;
  const pct = progress?.pct ?? null;
  // Further from the goal than when they started: either a real change or a wrong start weight, and worth a look either way (CR3).
  const movingAway = progress?.movingAway ?? false;
  const weekly = new Map<string, number[]>();
  for (const w of weights) {
    const key = isoWeekKey(w.log_date);
    weekly.set(key, [...(weekly.get(key) ?? []), w.bodyweight as number]);
  }
  const weeklyPoints = [...weekly.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-8);

  // ---- body scan ----
  const scan = bodyScans[0] ?? null;
  const prevScan = bodyScans[1] ?? null;

  // ---- needs doing ----
  const todo: { key: string; icon: typeof Check; title: string; hint: string; action: () => void; reviewed?: () => Promise<unknown> }[] = [];
  // A new member's automatic starting plan waits for the coach to check it (it used to be a separate banner). The plan and the targets
  // are at the top of their Nutrition now (CL8), so that is where this goes.
  if (profile?.needs_coach_review) {
    todo.push({
      key: 'new-member',
      icon: ClipboardList,
      title: 'New member: check their starting plan',
      hint:
        (profile.review_reasons ?? []).filter((r) => !r.toLowerCase().startsWith('new member')).join(' · ') ||
        'Check their targets under Nutrition, then set up their membership',
      action: () => onNavigate('Nutrition'),
      reviewed: isOwnClient ? () => clearReviewFlag(clientId) : undefined,
    });
  }
  if (reviews) {
    for (const w of [prevWeek, toIsoDate(addDays(new Date(prevWeek + 'T00:00:00Z'), -7))]) {
      const d = daysIn(w);
      if (d > 0 && !reviews.week.includes(w)) {
        todo.push({
          key: `week-${w}`,
          icon: Check,
          title: `Check-in to review: week of ${shortDate(w)}`,
          hint: `${d} day${d === 1 ? '' : 's'} logged`,
          action: () => onOpenCheckin(w),
        });
      }
    }
    for (const f of formAssignments.filter((a) => a.completed_at && !reviews.form.includes(a.id))) {
      if ((f.completed_at ?? '') < toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -30))) continue;
      todo.push({
        key: `form-${f.id}`,
        icon: FileText,
        title: `Form to read: ${f.template.name}`,
        hint: `Completed ${shortDate((f.completed_at ?? '').slice(0, 10))}`,
        action: () => onNavigate('Accountability', 'Forms'),
      });
    }
    // Anything older than the lookback above that nobody reviewed: one line, so it does not simply stop being mentioned.
    const older = olderUnreviewed({
      loggedDates: logged.map((l) => l.log_date),
      completedForms: formAssignments.map((a) => ({ id: a.id, completedAt: a.completed_at })),
      reviewedWeeks: reviews.week,
      reviewedForms: reviews.form,
      todayIso,
    });
    const olderLine = olderUnreviewedLine(older);
    if (olderLine) {
      todo.push({
        key: 'older-unreviewed',
        icon: Check,
        title: olderLine.title,
        hint: olderLine.hint,
        action: () => (older.weeks.length > 0 ? onOpenCheckin(older.weeks[0]) : onNavigate('Accountability', 'Forms')),
      });
    }
  }
  const pendingForms = formAssignments.filter((a) => !a.completed_at).length;
  if (pendingForms > 0) {
    todo.push({
      key: 'pending-forms',
      icon: ClipboardList,
      title: `${pendingForms} form${pendingForms === 1 ? '' : 's'} not filled in yet`,
      hint: 'Waiting on the member',
      action: () => onNavigate('Accountability', 'Forms'),
    });
  }
  const selfReported = new Map<string, BigDogResultRow>();
  for (const r of [...bigDogResults].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))) {
    if (!selfReported.has(r.exercise_key)) selfReported.set(r.exercise_key, r);
  }
  const toVerify = [...selfReported.values()].filter((r) => r.self_reported);
  if (toVerify.length > 0) {
    todo.push({
      key: 'scores',
      icon: Dumbbell,
      title: `${toVerify.length} peak week score${toVerify.length === 1 ? '' : 's'} to verify`,
      hint: 'Logged by the member',
      action: () => onNavigate('Achievements', 'Big Dog'),
    });
  }

  // "6 Week Challenge · week 2 of 6 · ends 15 Nov" (or "starts 12 Oct" before it begins).
  const planLabel = (() => {
    if (!membership) return 'No plan set up';
    // They have a plan but its row is not readable from here (R38): say so rather than that they have none.
    if (!membership.package) return 'On a plan (name not available)';
    return planCountdownLabel(
      membership.package.name,
      planCountdown({ ...membership, durationWeeks: membership.package.duration_weeks ?? null }, todayIso),
      shortDate
    );
  })();
  const { run: runReviewed, busy: reviewing } = useAction();
  const memberSince = profile?.join_date ?? null;
  // Coach-added injuries (Notes → Injuries & Limitations) always show, beside the member's own health notes. They used to show only
  // when they were among the two newest notes of any kind (CL9).
  const injuries = journalEntries.filter((n) => n.kind === 'injury');
  // The coach's own notes first, and a colleague's said to be theirs (CL15).
  const { notes, allMine: notesAllMine } = overviewNotes(journalEntries, currentUserId);

  // Energy, stress and hunger from the daily check-in, a week at a time over the last four (DB11). A measure the coach has stopped
  // asking this member for is left out.
  const offMetrics = toDisabledMetricSet(disabledMetrics);
  const scaleTrends = checkinScaleTrends(historyLogs, todayIso).filter((t) => !offMetrics.has(t.key));

  const weightChange = nowWeight != null && start != null ? nowWeight - start : null;
  // The member's weights in their own units, with kilograms alongside (D16).
  const unit = weightUnitOf(profile?.weight_unit);
  return (
    <div className="mx-auto max-w-6xl space-y-5">
    <CoachStatStrip
      label={`${profile?.name ?? 'Member'} at a glance`}
      stats={[
        {
          label: 'Weight',
          value: nowWeight != null ? formatWeightForCoach(nowWeight, unit) : '—',
          sub:
            weightChange != null && Math.abs(weightChange) >= 0.05
              ? `${weightChange < 0 ? 'Down' : 'Up'} ${formatWeightDiffForCoach(weightChange, unit)} since the start`
              : nowWeight == null
                ? 'No weigh-ins yet'
                : 'Same as the start',
        },
        { label: 'Days logged', value: `${weekDays.length} of 7`, sub: 'This week' },
        {
          label: 'Sessions this week',
          value: perWeek ? `${attendedThisWeek} of ${perWeek}` : String(attendedThisWeek),
          sub: nextClass ? `Next: ${longDate(nextClass.booking_date)} ${formatClassTime(nextClass.class?.start_time)}` : 'Nothing booked',
        },
        { label: 'Credits', value: String(creditsBalance), sub: planLabel, tone: creditsBalance <= 1 && membership ? 'amber' : undefined },
      ]}
    />
    <div className="space-y-5 lg:grid lg:grid-cols-5 lg:items-start lg:gap-5 lg:space-y-0">
      <div className="space-y-5 lg:col-span-3">
      {/* ---- who: the name is in the header above, so this is what to know about them ---- */}
      <Card>
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-sm text-zinc-500">
              {lastActiveLabel(healthStatus)}
              {memberSince ? ` · member since ${shortDate(memberSince)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                {planLabel}
              </span>
              <span
                className={`min-h-8 rounded-full px-3 text-xs font-bold ${
                  creditsBalance <= 1 && membership ? 'bg-warning/15 text-warning' : 'bg-black/5 text-zinc-600 dark:bg-white/10 dark:text-zinc-300'
                }`}
              >
                {creditsBalance} credit{creditsBalance === 1 ? '' : 's'}
              </span>
              <span className="rounded-full bg-black/5 px-2.5 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                {isPhoto ? 'Photo diary' : profile?.nutrition_tracking_mode === 'manual_import' ? 'Typed totals' : 'Full tracking'}
              </span>
            </div>
          </div>
        </div>
        {profile?.goal_description && (
          <p className="mt-3 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">
            <b className="text-zinc-500">Goal:</b> {profile.goal_description}
          </p>
        )}
        {profile?.health_notes && (
          <p className="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-black dark:text-zinc-100">
            <b className="text-warning">Health notes:</b> {profile.health_notes}
          </p>
        )}
        {injuries.length > 0 && (
          <div className="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-black dark:text-zinc-100">
            <b className="text-warning">Injuries &amp; limitations</b>
            <ul className="mt-0.5 space-y-0.5">
              {injuries.map((i) => (
                <li key={i.id} className="whitespace-pre-wrap">
                  {i.body} <span className="text-zinc-500">· {shortDate(i.created_at.slice(0, 10))}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {/* The jobs a coach does most often here, one tap each (CL12): this week's check-in, their programme, a note. Forms are in
            Check-in, and any waiting to be read are listed under Needs you. */}
        <div className="mt-3 flex flex-wrap gap-2">
          {[
            { key: 'checkin', icon: Check, label: "This week's check-in", onClick: () => onOpenCheckin(thisWeek) },
            { key: 'programme', icon: Dumbbell, label: 'Programme', onClick: () => onNavigate('Training', 'Workout') },
            ...(isOwnClient ? [{ key: 'note', icon: NotebookPen, label: 'Add a note', onClick: () => onNavigate('Account Settings', 'Info') }] : []),
          ].map((a) => (
            <button
              key={a.key}
              type="button"
              onClick={a.onClick}
              className="inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-3.5 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50"
            >
              <a.icon className="h-4 w-4" aria-hidden /> {a.label}
            </button>
          ))}
        </div>
      </Card>

      {/* ---- needs doing ---- */}
      {todo.length > 0 && (
        <div>
          <SectionLabel>Needs you · {todo.length}</SectionLabel>
          <Card className="!py-1">
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {todo.map((t) => (
                <div key={t.key} className="flex items-center gap-2">
                  <button type="button" onClick={t.action} className="flex min-w-0 flex-1 items-center gap-3 py-3 text-left">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                      <t.icon className="h-4 w-4" />
                    </span>
                    {/* Wrapped, not cut short: "Check-in to review: week of 26 …" lost its date on a phone (CV21). */}
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-bold text-black dark:text-zinc-50">{t.title}</span>
                      <span className="block break-words text-xs text-zinc-500">{t.hint}</span>
                    </span>
                    {!t.reviewed && <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />}
                  </button>
                  {t.reviewed && (
                    <button
                      type="button"
                      disabled={reviewing}
                      onClick={() => runReviewed(t.reviewed as () => Promise<unknown>, { success: 'Marked as reviewed' })}
                      className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent-soft px-4 text-sm font-bold text-accent disabled:opacity-50"
                    >
                      {reviewing ? 'Saving…' : 'Reviewed'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ---- this week ---- */}
      <div>
        <SectionLabel>This week</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
          <Tile
            icon={Check}
            label="Days logged"
            value={`${weekDays.length} / 7`}
            hint={
              daysIn(prevWeek) > 0
                ? `Last week: ${daysIn(prevWeek)} days${reviews?.week.includes(prevWeek) ? ', reviewed' : ', tap to review'}`
                : weekDays.length === 0
                  ? 'Nothing logged yet'
                  : undefined
            }
            onClick={daysIn(prevWeek) > 0 ? () => onOpenCheckin(prevWeek) : undefined}
          />
          <Tile
            icon={CalendarDays}
            label="Sessions attended"
            value={`${attendedThisWeek}${perWeek ? ` / ${perWeek}` : ''}`}
            hint={`${perWeek ? `Plan allows ${perWeek} a week. ` : ''}${nextClass ? `Next: ${longDate(nextClass.booking_date)} ${formatClassTime(nextClass.class?.start_time)}` : 'Nothing booked'}`}
          />
          <Tile
            icon={Footprints}
            label="Steps (avg)"
            value={stepsAvg != null ? Math.round(stepsAvg).toLocaleString() : '—'}
            tone={stepsAvg != null ? trafficLight('steps', stepsAvg) : null}
            hint={
              <>
                {stepsAvg != null && <>{fromDays(stepsDays)} · </>}
                green is {TRACKER_THRESHOLDS.steps.green.toLocaleString()}+
              </>
            }
          />
          <Tile
            icon={Moon}
            label="Sleep (avg)"
            value={sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : '—'}
            tone={sleepAvg != null ? trafficLight('sleep', sleepAvg) : null}
            hint={
              <>
                {sleepAvg != null && <>{fromDays(sleepDays)} · </>}
                green is {TRACKER_THRESHOLDS.sleep.green}h+
              </>
            }
          />
          {/* Coloured against the target as steps and sleep are against theirs, with protein beside it (CL13, DB11). */}
          {!isPhoto && (
            <Tile
              icon={Utensils}
              label="Calories (avg)"
              value={kcalAvg != null ? Math.round(kcalAvg).toLocaleString() : '—'}
              tone={kcalAvg != null && dayTarget ? calorieTone(kcalAvg, dayTarget.calories) : null}
              hint={foodHint(dayTarget ? Math.round(dayTarget.calories).toLocaleString() : null)}
            />
          )}
          {!isPhoto && (
            <Tile
              icon={Beef}
              label="Protein (avg)"
              value={proteinAvg != null ? `${Math.round(proteinAvg)}g` : '—'}
              tone={proteinAvg != null && dayTarget ? proteinTone(proteinAvg, dayTarget.protein) : null}
              hint={foodHint(dayTarget ? `${Math.round(dayTarget.protein)}g` : null)}
            />
          )}
          {/* Only for the coach's own member: a colleague's member's chat is private to their coach (D3). */}
          {isOwnClient && (
            <Tile
              icon={MessageSquare}
              label="Unread messages"
              value={String(unreadMessages)}
              tone={unreadMessages > 0 ? 'amber' : null}
              hint={unreadMessages > 0 ? 'Waiting for your reply · tap to open the chat' : 'Nothing waiting from them'}
              onClick={() => onNavigate('Messages')}
            />
          )}
          <Tile
            icon={Activity}
            label="Workouts logged"
            value={`${loggedWorkoutDays} day${loggedWorkoutDays === 1 ? '' : 's'}`}
            hint={lastWorkout ? `Last: ${longDate(lastWorkout)}` : 'No workouts logged'}
          />
        </div>
      </div>

      {/* ---- energy, stress, hunger: the last four weeks (DB11) ---- */}
      {scaleTrends.length > 0 && (
        <div>
          <SectionLabel>Check-in scores · last {TREND_WEEKS} weeks</SectionLabel>
          <Card flush className={`grid divide-x divide-black/5 dark:divide-white/10 ${scaleTrends.length === 3 ? 'grid-cols-3' : scaleTrends.length === 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
            {scaleTrends.map((t) => (
              <ScaleTrendCell key={t.key} trend={t} />
            ))}
          </Card>
        </div>
      )}

      </div>
      <div className="space-y-4 lg:col-span-2">
      {/* ---- weight ---- */}
      <div>
        <SectionLabel>Weight</SectionLabel>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 text-2xl font-extrabold text-black dark:text-zinc-50">
              <Scale className="h-5 w-5 text-accent" />
              {nowWeight != null ? formatWeight(nowWeight, unit) : '—'}
              {nowWeight != null && unit === 'st_lb' && <span className="text-sm font-bold text-zinc-500">{nowWeight.toFixed(1)} kg</span>}
            </p>
            {pct != null &&
              (movingAway ? (
                <span className="text-sm font-bold text-danger">Moving away from goal</span>
              ) : (
                <span className="text-sm font-bold text-accent">{pct}% to goal</span>
              ))}
          </div>
          {start != null && goal != null && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between gap-2 text-xs text-zinc-500">
                <span>Start {formatWeightForCoach(start, unit)}</span>
                {nowWeight != null && (
                  <span className={movingAway ? 'font-bold text-danger' : undefined}>
                    {nowWeight - start > 0 ? '+' : nowWeight - start < 0 ? '-' : ''}
                    {formatWeightDiffForCoach(nowWeight - start, unit)} since start
                  </span>
                )}
                <span className="text-right">Goal {formatWeightForCoach(goal, unit)}</span>
              </div>
              {movingAway && progress && (
                <p className="mt-2 rounded-xl bg-danger/10 px-3 py-2 text-xs text-black dark:text-zinc-100">
                  <b className="text-danger">{formatWeightDiffForCoach(progress.awayKg, unit)} further from the goal than at the start.</b> Check the start weight is right, then talk it through with them.
                </p>
              )}
            </>
          )}
          {weeklyPoints.length >= 2 && (
            <div className="mt-3">
              <TrendChart
                values={weeklyPoints.map(([, v]) => v.reduce((a, b) => a + b, 0) / v.length)}
                labels={weeklyPoints.map(([k]) => shortDate(k))}
                color="var(--chart-1)"
                formatter={(v) => formatWeightShort(v, unit)}
              />
            </div>
          )}
          {nowWeight == null && <p className="mt-2 text-xs text-zinc-500">No weigh-ins logged yet.</p>}
          {nowWeight != null && weights.length === 0 && nowWeightDate && (
            <p className="mt-2 text-xs text-zinc-500">Last weighed in on {longDate(nowWeightDate)}. Nothing in the last 12 weeks.</p>
          )}
        </Card>
      </div>

      {/* ---- body scan ---- */}
      {scan && (
        <div>
          <SectionLabel>Latest body scan · {shortDate(scan.scan_date)}</SectionLabel>
          <Card flush className="grid grid-cols-3 divide-x divide-black/5 dark:divide-white/10">
            {[
              { l: 'Muscle', v: scan.skeletal_muscle_kg, p: prevScan?.skeletal_muscle_kg, u: 'kg', good: 'up' as const },
              { l: 'Body fat', v: scan.body_fat_pct, p: prevScan?.body_fat_pct, u: '%', good: 'down' as const },
              { l: 'Weight', v: scan.weight_kg, p: prevScan?.weight_kg, u: 'kg', good: null },
            ].map((m) => {
              const d = m.v != null && m.p != null ? m.v - m.p : null;
              return (
                <button key={m.l} type="button" onClick={() => onNavigate('Progress', 'Body Scans')} className="p-3.5 text-left">
                  <span className="flex items-center gap-1 text-xs font-bold uppercase tracking-[0.08em] text-zinc-500 dark:text-zinc-400">
                    <ScanLine className="h-3 w-3" /> {m.l}
                  </span>
                  <span className="mt-0.5 block text-lg font-extrabold text-black dark:text-zinc-50">{m.v != null ? `${m.v}${m.u}` : '—'}</span>
                  {d != null && Math.abs(d) >= 0.05 && (
                    <span className={`text-[11px] font-bold ${m.good == null ? 'text-zinc-500' : (m.good === 'up') === d > 0 ? 'text-success' : 'text-danger'}`}>
                      {d > 0 ? '+' : ''}{d.toFixed(1)}
                    </span>
                  )}
                </button>
              );
            })}
          </Card>
        </div>
      )}

      {/* ---- notes ---- */}
      {notes.length > 0 && (
        <div>
          <SectionLabel>{notesAllMine ? 'Your notes' : 'Notes'}</SectionLabel>
          <Card className="space-y-2.5">
            {notes.map((n) => (
              <div key={n.id}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                  {n.kind} · {shortDate(n.created_at.slice(0, 10))}
                  {!n.mine && <span className="normal-case tracking-normal"> · by another coach</span>}
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{n.body}</p>
              </div>
            ))}
            <button type="button" onClick={() => onNavigate('Account Settings', 'Info')} className="inline-flex min-h-10 items-center text-xs font-bold text-accent">
              All notes →
            </button>
          </Card>
        </div>
      )}

      {/* ---- manage ---- */}
      <div>
        <SectionLabel>Manage</SectionLabel>
        <ListGroup>
          {/* The targets are at the top of Nutrition now (CL8). */}
          <ListRow icon={UserCog} title="Details & goal" subtitle="Contact details, goal, their screens and check-in measures" onClick={() => onNavigate('Account Settings', 'Setup')} />
          <ListRow icon={Wallet} title="Credits & plan" subtitle="Membership, credits and check-in reminders" onClick={() => onNavigate('Account Settings', 'Credits')} />
          <ListRow icon={NotebookPen} title="Notes" subtitle="Your private notes on this member" onClick={() => onNavigate('Account Settings', 'Info')} />
          <ListRow icon={GraduationCap} title="Courses" subtitle="Resources assigned to them" onClick={() => onNavigate('Learn')} />
        </ListGroup>
      </div>

      {/* ---- big dog ---- */}
      <BigDogCard results={bigDogResults} onOpen={() => onNavigate('Achievements', 'Big Dog')} />

      {!isOwnClient && (
        <p className="text-center text-xs text-zinc-500">
          {ownerCoachName ? `${ownerCoachName}'s member` : "Another coach's member"}: you can read everything here, but only their coach can change it.
        </p>
      )}
      </div>
    </div>
    </div>
  );
}
