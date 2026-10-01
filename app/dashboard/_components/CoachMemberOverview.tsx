'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Dumbbell,
  FileText,
  Footprints,
  GraduationCap,
  NotebookPen,
  UserCog,
  Wallet,
  MessageSquare,
  Moon,
  Scale,
  ScanLine,
  Utensils,
} from 'lucide-react';
import { Avatar } from '@/app/_components/Avatar';
import { Card, IconChip, ListGroup, ListRow, SectionLabel } from '@/app/_components/ui';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { getReviews } from '@/lib/data/coachReviews';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { addDays, formatClassTime, isoWeekKey, toIsoDate, todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { TrendChart } from './OverviewTab';
import { BigDogCard } from './BigDogTab';
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

function Tile({ icon, label, value, hint }: { icon: typeof Check; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-3.5 dark:border-white/10">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
        <IconChip icon={icon} size="sm" /> {label}
      </p>
      <p className="mt-1.5 text-xl font-extrabold text-black dark:text-zinc-50">{value}</p>
      {hint && <p className="text-[11px] text-zinc-500">{hint}</p>}
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
  const foodDays = weekDays.filter((l) => l.protein != null || l.carbs != null || l.fat != null);
  const kcalAvg = avg(foodDays.map((l) => dayCalories(l.protein ?? 0, l.carbs ?? 0, l.fat ?? 0)));
  const dayTarget = useMemo(() => {
    const engine = toEngineProfile(profile);
    return engine ? weeklyTarget(engine, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);
  const attendedThisWeek = bookings.filter((b) => b.attended && b.booking_date >= thisWeek).length;
  const perWeek = membership?.package?.credits_per_week ?? null;
  const loggedWorkoutDays = new Set(workoutLogs.filter((w) => w.logged_at.slice(0, 10) >= thisWeek).map((w) => w.logged_at.slice(0, 10))).size;
  const lastWorkout = workoutLogs.map((w) => w.logged_at.slice(0, 10)).sort().at(-1) ?? null;
  const nextClass = bookings
    .filter((b) => b.status === 'booked' && b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')))[0];

  // ---- weight ----
  const weights = logged.filter((l) => l.bodyweight != null).sort((a, b) => (a.log_date < b.log_date ? -1 : 1));
  const nowWeight = weights.at(-1)?.bodyweight ?? null;
  const start = profile?.start_weight ?? null;
  const goal = profile?.goal_weight ?? null;
  const pct =
    start != null && goal != null && start !== goal && nowWeight != null
      ? Math.max(0, Math.min(100, Math.round((((start - nowWeight) * (start > goal ? 1 : -1)) / Math.abs(start - goal)) * 100)))
      : null;
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
  const todo: { key: string; icon: typeof Check; title: string; hint: string; action: () => void }[] = [];
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

  const memberSince = profile?.join_date ?? null;
  const notes = journalEntries.slice(0, 2);

  return (
    <div className="space-y-4">
      {/* ---- who ---- */}
      <Card>
        <div className="flex items-start gap-3">
          <Avatar name={profile?.name ?? 'Member'} size="lg" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-extrabold text-black dark:text-zinc-50">{profile?.name ?? 'Member'}</p>
            <p className="text-xs text-zinc-500">
              {healthStatus && healthStatus.status !== 'unmonitored'
                ? healthStatus.daysSinceActive === 0
                  ? 'Active today'
                  : `Last active ${healthStatus.daysSinceActive} day${healthStatus.daysSinceActive === 1 ? '' : 's'} ago`
                : 'Not monitored'}
              {memberSince ? ` · member since ${shortDate(memberSince)}` : ''}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-accent/15 px-2.5 py-0.5 text-[11px] font-bold text-accent">
                {membership?.package ? membership.package.name : 'No plan set up'}
              </span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
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
        {profile?.goal_description && <p className="mt-3 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{profile.goal_description}</p>}
        {profile?.health_notes && (
          <p className="mt-2 rounded-xl bg-warning/10 px-3 py-2 text-xs text-black dark:text-zinc-100">
            <b className="text-warning">Health notes:</b> {profile.health_notes}
          </p>
        )}
        <div className="mt-3 flex gap-2">
          <button type="button" onClick={() => onNavigate('Messages')} className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent py-2.5 text-sm font-extrabold text-accent-foreground">
            <MessageSquare className="h-4 w-4" /> Message
          </button>
          <button type="button" onClick={() => onNavigate('Accountability', 'Forms')} className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-black/10 py-2.5 text-sm font-bold dark:border-white/15">
            <FileText className="h-4 w-4" /> Forms
          </button>
        </div>
      </Card>

      {/* ---- needs doing ---- */}
      {todo.length > 0 && (
        <div>
          <SectionLabel>Needs you · {todo.length}</SectionLabel>
          <Card className="!py-1">
            <div className="divide-y divide-black/5 dark:divide-white/10">
              {todo.map((t) => (
                <button key={t.key} type="button" onClick={t.action} className="flex w-full items-center gap-3 py-3 text-left">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-warning/15 text-warning">
                    <t.icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{t.title}</span>
                    <span className="block truncate text-xs text-zinc-500">{t.hint}</span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                </button>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ---- this week ---- */}
      <div>
        <SectionLabel>This week</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5">
          <Tile icon={Check} label="Check-in" value={`${weekDays.length} / 7 days`} hint={weekDays.length === 0 ? 'Nothing logged yet' : undefined} />
          <Tile
            icon={CalendarDays}
            label="Sessions"
            value={`${attendedThisWeek}${perWeek ? ` / ${perWeek}` : ''}`}
            hint={nextClass ? `Next: ${longDate(nextClass.booking_date)} ${formatClassTime(nextClass.class?.start_time)}` : 'Nothing booked'}
          />
          <Tile icon={Footprints} label="Steps (avg)" value={stepsAvg != null ? Math.round(stepsAvg).toLocaleString() : '—'} />
          <Tile icon={Moon} label="Sleep (avg)" value={sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : '—'} />
          {!isPhoto && (
            <Tile
              icon={Utensils}
              label="Calories (avg)"
              value={kcalAvg != null ? Math.round(kcalAvg).toLocaleString() : '—'}
              hint={dayTarget ? `Target ${Math.round(dayTarget.calories).toLocaleString()}` : undefined}
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

      {/* ---- weight ---- */}
      <div>
        <SectionLabel>Weight</SectionLabel>
        <Card>
          <div className="flex items-baseline justify-between gap-2">
            <p className="flex items-center gap-2 text-2xl font-extrabold text-black dark:text-zinc-50">
              <Scale className="h-5 w-5 text-accent" />
              {nowWeight != null ? `${nowWeight.toFixed(1)}kg` : '—'}
            </p>
            {pct != null && <span className="text-sm font-bold text-accent">{pct}% to goal</span>}
          </div>
          {start != null && goal != null && (
            <>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-black/[.06] dark:bg-white/10">
                <div className="h-full rounded-full bg-accent" style={{ width: `${pct ?? 0}%` }} />
              </div>
              <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
                <span>Start {start}kg</span>
                {nowWeight != null && <span>{nowWeight - start > 0 ? '+' : ''}{(nowWeight - start).toFixed(1)}kg since start</span>}
                <span>Goal {goal}kg</span>
              </div>
            </>
          )}
          {weeklyPoints.length >= 2 && (
            <div className="mt-3">
              <TrendChart
                values={weeklyPoints.map(([, v]) => v.reduce((a, b) => a + b, 0) / v.length)}
                labels={weeklyPoints.map(([k]) => shortDate(k))}
                color="var(--chart-1)"
                formatter={(v) => v.toFixed(1)}
              />
            </div>
          )}
          {weights.length === 0 && <p className="mt-2 text-xs text-zinc-500">No weigh-ins logged yet.</p>}
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
                  <span className="flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide text-zinc-400">
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
          <SectionLabel>Your notes</SectionLabel>
          <Card className="space-y-2.5">
            {notes.map((n) => (
              <div key={n.id}>
                <p className="text-[11px] font-bold uppercase tracking-wide text-zinc-400">
                  {n.kind} · {shortDate(n.created_at.slice(0, 10))}
                </p>
                <p className="line-clamp-3 whitespace-pre-wrap text-sm text-zinc-700 dark:text-zinc-300">{n.body}</p>
              </div>
            ))}
            <button type="button" onClick={() => onNavigate('Account Settings', 'Info')} className="text-xs font-bold text-accent">
              All notes →
            </button>
          </Card>
        </div>
      )}

      {/* ---- manage ---- */}
      <div>
        <SectionLabel>Manage</SectionLabel>
        <ListGroup>
          <ListRow icon={UserCog} title="Details, goals & targets" subtitle="Contact details, goal, calorie and macro targets" onClick={() => onNavigate('Account Settings', 'Setup')} />
          <ListRow icon={Wallet} title="Credits & plan" subtitle="Membership, credits and check-in reminders" onClick={() => onNavigate('Account Settings', 'Credits')} />
          <ListRow icon={NotebookPen} title="Notes" subtitle="Your private notes on this member" onClick={() => onNavigate('Account Settings', 'Info')} />
          <ListRow icon={GraduationCap} title="Courses" subtitle="Resources assigned to them" onClick={() => onNavigate('Learn')} />
        </ListGroup>
      </div>

      {/* ---- big dog ---- */}
      <BigDogCard results={bigDogResults} onOpen={() => onNavigate('Achievements', 'Big Dog')} />

      {!isOwnClient && <p className="text-center text-xs text-zinc-500">You are viewing another coach&apos;s member (read-only).</p>}
    </div>
  );
}
