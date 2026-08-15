import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import { CalendarDays, Camera, CheckSquare, Flame, Heart } from 'lucide-react';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { toIsoDate, addDays, formatClassTime } from '@/lib/utils/dates';
import { ProgressRing } from '@/app/_components/ProgressRing';
import type {
  BookingRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  FormAssignmentWithDetails,
  HabitWithLogs,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';
import type { Category, Screen } from './categories';
import { CheckInButton } from './CheckInButton';

function currentStreak(historyLogs: DailyLogRow[], todayIso: string): number {
  const loggedDates = new Set(historyLogs.filter(hasLoggedData).map((l) => l.log_date));
  let streak = 0;
  let cursor = todayIso;
  while (loggedDates.has(cursor)) {
    streak += 1;
    cursor = toIsoDate(addDays(new Date(cursor + 'T00:00:00Z'), -1));
  }
  return streak;
}

const cardCls = 'rounded-2xl border border-black/[.05] bg-[var(--background)] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';
const clickableCardCls = `${cardCls} w-full text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]`;
const labelCls = 'text-xs font-medium text-zinc-500';
const valueCls = 'mt-1 text-xl font-semibold text-black dark:text-zinc-50';

const TINTS = {
  rose: 'bg-rose-50 text-rose-500 dark:bg-rose-500/10 dark:text-rose-400',
  emerald: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400',
  violet: 'bg-violet-50 text-violet-600 dark:bg-violet-500/10 dark:text-violet-400',
} as const;

function IconChip({ icon: Icon, tint }: { icon: LucideIcon; tint: keyof typeof TINTS }) {
  return (
    <span className={`mb-2 flex h-8 w-8 items-center justify-center rounded-lg ${TINTS[tint]}`}>
      <Icon className="h-4 w-4" />
    </span>
  );
}

function MacroBar({ label, value, target }: { label: string; value: number; target: number }) {
  const pct = target > 0 ? Math.min(100, Math.max(0, (value / target) * 100)) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-[11px] text-white/80">
        <span>{label}</span>
        <span>{Math.round(value)}/{Math.round(target)}g</span>
      </div>
      <div className="mt-1 h-1.5 w-full rounded-full bg-white/20">
        <div className="h-1.5 rounded-full bg-white" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function TodayTab({
  profile,
  programWeek,
  weekLogs,
  historyLogs,
  habits,
  formAssignments,
  bookings,
  creditsBalance,
  membership,
  programs,
  workoutLogs,
  onCheckIn,
  onNavigate,
  onNavigateClasses,
}: {
  profile: ClientProfileRow | null;
  programWeek: number;
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  habits: HabitWithLogs[];
  formAssignments: FormAssignmentWithDetails[];
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  onNavigate: (category: Category, screen?: Screen) => void;
  onNavigateClasses?: () => void;
}) {
  const todayIso = toIsoDate(new Date());
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);
  const todayCalories = todayLog ? dayCalories(todayLog.protein ?? 0, todayLog.carbs ?? 0, todayLog.fat ?? 0) : 0;

  const dayTarget = useMemo(() => {
    const engineProfile = toEngineProfile(profile);
    return engineProfile ? weeklyTarget(engineProfile, programWeek)?.dailyFlat ?? null : null;
  }, [profile, programWeek]);

  const streak = currentStreak(historyLogs, todayIso);

  const habitsDoneToday = habits.filter((h) => h.logs.find((l) => l.log_date === todayIso)?.completed).length;

  const pendingForms = formAssignments.filter((a) => !a.completed_at).length;

  const nextClass = bookings
    .filter((b) => b.status === 'booked' && b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')))[0];

  const nextClassLabel = nextClass
    ? `${nextClass.class?.name} · ${new Date(nextClass.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short' })} ${formatClassTime(nextClass.class?.start_time)}`
    : 'None booked';

  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';

  return (
    <div className="space-y-3">
      {/* Hidden on mobile -- DashboardShell's mobileHeader shows this same greeting there
          (avatar chip + date), to match the redesign's compact per-screen mobile header. */}
      <p className="hidden text-sm font-medium text-zinc-500 md:block">{timeGreeting}, {firstName}</p>

      <button
        type="button"
        onClick={() => onNavigate('Nutrition', 'Food Tracking')}
        className="block w-full overflow-hidden rounded-2xl p-5 text-left text-white shadow-[0_1px_2px_rgba(0,0,0,.02)]"
        style={{ background: 'linear-gradient(155deg, #19adb1, #0e6266)' }}
      >
        <div className="flex items-center gap-4">
          {dayTarget ? (
            <ProgressRing
              value={todayCalories}
              target={dayTarget.calories}
              label="kcal"
              size={88}
              strokeWidth={8}
              color="#8fe3e6"
              trackClassName="stroke-white/20"
              hideValue
            />
          ) : (
            <div className="flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full border-2 border-white/20 text-xs text-white/70">
              No target
            </div>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium uppercase tracking-wide text-white/70">Today&apos;s nutrition</p>
            {dayTarget ? (
              <p className="text-2xl font-bold text-white">
                {Math.round(todayCalories).toLocaleString()} kcal
                <span className="block text-sm font-normal text-white/70">of {Math.round(dayTarget.calories).toLocaleString()} kcal target</span>
              </p>
            ) : (
              <p className="text-sm text-white/80">Finish setup to see your targets.</p>
            )}
          </div>
        </div>
        {dayTarget && (
          <div className="mt-4 grid grid-cols-3 gap-3">
            <MacroBar label="Protein" value={todayLog?.protein ?? 0} target={dayTarget.protein} />
            <MacroBar label="Carbs" value={todayLog?.carbs ?? 0} target={dayTarget.carbs} />
            <MacroBar label="Fat" value={todayLog?.fat ?? 0} target={dayTarget.fat} />
          </div>
        )}
      </button>

      <div className="grid grid-cols-2 gap-3">
        <button type="button" onClick={() => onNavigate('Accountability', 'Weekly Log')} className={clickableCardCls}>
          <IconChip icon={Flame} tint="rose" />
          <p className={labelCls}>Current streak</p>
          <p className={valueCls}>{streak} {streak === 1 ? 'day' : 'days'}</p>
        </button>

        <button type="button" onClick={() => onNavigate('Accountability', 'Weekly Log')} className={clickableCardCls}>
          <IconChip icon={CheckSquare} tint="emerald" />
          <p className={labelCls}>Habits today</p>
          <p className={valueCls}>
            {habits.length === 0 ? '—' : `${habitsDoneToday} of ${habits.length}`}
          </p>
        </button>
      </div>

      <div className={cardCls}>
        {onNavigateClasses ? (
          <button type="button" onClick={onNavigateClasses} className="w-full text-left">
            <IconChip icon={CalendarDays} tint="violet" />
            <p className={labelCls}>Next class</p>
            <p className={valueCls}>{nextClassLabel}</p>
          </button>
        ) : (
          <>
            <IconChip icon={CalendarDays} tint="violet" />
            <p className={labelCls}>Next class</p>
            <p className={valueCls}>{nextClassLabel}</p>
          </>
        )}
        {nextClass && nextClass.booking_date === todayIso && (
          <div className="mt-2">
            <CheckInButton classRow={nextClass.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} />
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        {onNavigateClasses ? (
          <button type="button" onClick={onNavigateClasses} className={clickableCardCls}>
            <p className={`${labelCls} flex items-center gap-1.5`}>
              <Heart className="h-4 w-4 text-accent" />
              Credits
            </p>
            <p className={valueCls}>
              {creditsBalance}
              {membership?.package ? ` · ${membership.package.name}` : ''}
            </p>
          </button>
        ) : (
          <div className={cardCls}>
            <p className={`${labelCls} flex items-center gap-1.5`}>
              <Heart className="h-4 w-4 text-accent" />
              Credits
            </p>
            <p className={valueCls}>
              {creditsBalance}
              {membership?.package ? ` · ${membership.package.name}` : ''}
            </p>
          </div>
        )}

        <button type="button" onClick={() => onNavigate('Accountability', 'Forms')} className={clickableCardCls}>
          <p className={`${labelCls} flex items-center gap-1.5`}>
            <Camera className="h-4 w-4 text-accent" />
            Pending forms
          </p>
          <p className={valueCls}>{pendingForms}</p>
        </button>
      </div>
    </div>
  );
}
