import { useMemo } from 'react';
import { CalendarDays, Camera, CheckSquare, Flame, Heart } from 'lucide-react';
import { dayCalories, weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { toIsoDate, addDays, formatClassTime, todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { ProgressRing } from '@/app/_components/ProgressRing';
import type {
  BookingRow,
  ClientMembershipRow,
  ClientProfileRow,
  DailyLogRow,
  FormAssignmentWithDetails,
  HabitWithLogs,
  BigDogResultRow,
  RewardRow,
  WorkoutLogRow,
  WorkoutProgramRow,
} from '@/lib/data/types';
import type { Category, Screen } from './categories';
import { CheckInButton } from './CheckInButton';
import { BpHomeHero, BpHomeSections, BpMainTiles } from './BpHome';
import { BigDogCard } from './BigDogTab';
import { Card, IconChip } from '@/app/_components/ui';

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

const cardCls = 'rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10';
const clickableCardCls = `${cardCls} w-full text-left transition-colors hover:bg-black/[.02] dark:hover:bg-white/[.03]`;
const labelCls = 'text-xs font-medium text-zinc-500';
const valueCls = 'mt-1 text-xl font-semibold text-black dark:text-zinc-50';

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
  isCoachView = false,
  rewards = [],
  bigDogResults = [],
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
  isCoachView?: boolean;
  rewards?: RewardRow[];
  bigDogResults?: BigDogResultRow[];
}) {
  // Must match the timezone dashboardBundle used server-side to resolve `weekLogs`/streaks/etc
  // (see lib/data/dashboardBundle.ts) -- a raw `toIsoDate(new Date())` here is the UTC date,
  // which disagrees with the client's local "today" for roughly half of every day outside UTC.
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
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


  const firstName = profile?.name?.trim().split(/\s+/)[0] ?? 'there';
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';

  return (
    <div className="space-y-3">
      {!isCoachView && <BpHomeHero profile={profile} membership={membership} creditsBalance={creditsBalance} onNavigateClasses={onNavigateClasses} />}

      {isCoachView && (
      <>
      {/* Hidden on mobile -- DashboardShell's mobileHeader shows this same greeting there
          (avatar chip + date), to match the redesign's compact per-screen mobile header. */}
      <p className="hidden text-sm font-medium text-zinc-500 md:block">{timeGreeting}, {firstName}</p>

      <button
        type="button"
        onClick={() => onNavigate('Nutrition', 'Food Tracking')}
        className="block w-full overflow-hidden rounded-2xl p-5 text-left text-white shadow-[0_1px_2px_rgba(0,0,0,.02)]"
        style={{ background: 'linear-gradient(155deg, #2abfbf, #157f7f)' }}
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
      </>
      )}

      {!isCoachView && (
        <div className="rounded-3xl border border-accent/30 bg-accent-soft p-4">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-accent">
            {nextClass ? (nextClass.booking_date === todayIso ? 'Today' : 'Next session') : 'Your next session'}
          </p>
          {nextClass ? (
            <>
              <button type="button" onClick={onNavigateClasses} className="mt-1 block w-full text-left">
                <span className="block text-3xl font-black leading-tight text-black dark:text-zinc-50">
                  {formatClassTime(nextClass.class?.start_time) || nextClass.class?.name}
                </span>
                <span className="block text-sm text-zinc-600 dark:text-zinc-400">
                  {nextClass.class?.name} ·{' '}
                  {nextClass.booking_date === todayIso
                    ? 'today'
                    : new Date(nextClass.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                </span>
              </button>
              {nextClass.booking_date === todayIso && (
                <div className="mt-3">
                  <CheckInButton classRow={nextClass.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} timezone={profile?.timezone} date={nextClass.booking_date} attended={nextClass.attended} />
                </div>
              )}
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">You don&apos;t have anything booked.</p>
              <button
                type="button"
                onClick={onNavigateClasses}
                className="mt-3 rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-foreground"
              >
                Book a session
              </button>
            </>
          )}
        </div>
      )}

      {!isCoachView && <BpMainTiles onNavigate={onNavigate} onNavigateClasses={onNavigateClasses} />}

      {isCoachView && <Card className="!p-3.5">
        {(() => {
          const body = (
            <span className="flex items-center gap-3">
              <IconChip icon={CalendarDays} size="lg" />
              <span className="min-w-0">
                <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-zinc-500">Next class</span>
                <span className="block truncate text-base font-extrabold text-black dark:text-zinc-50">
                  {nextClass ? nextClass.class?.name : 'None booked'}
                </span>
                <span className="block text-sm text-zinc-500">
                  {nextClass
                    ? `${new Date(nextClass.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })} · ${formatClassTime(nextClass.class?.start_time)}`
                    : isCoachView ? '' : 'Tap to book a session'}
                </span>
              </span>
            </span>
          );
          return onNavigateClasses ? (
            <button type="button" onClick={onNavigateClasses} className="w-full text-left">
              {body}
            </button>
          ) : (
            body
          );
        })()}
        {nextClass && nextClass.booking_date === todayIso && (
          <div className="mt-3">
            <CheckInButton classRow={nextClass.class} programs={programs} workoutLogs={workoutLogs} onCheckIn={onCheckIn} timezone={profile?.timezone} date={nextClass.booking_date} attended={nextClass.attended} />
          </div>
        )}
      </Card>}

      <Card flush className="grid grid-cols-2 divide-x divide-black/5 dark:divide-white/10">
        <button type="button" onClick={() => onNavigate('Accountability', 'Weekly Log')} className="flex items-center gap-3 p-3.5 text-left">
          <IconChip icon={Flame} tone="muted" />
          <span>
            <span className="block text-lg font-extrabold leading-tight text-black dark:text-zinc-50">
              {streak} {streak === 1 ? 'day' : 'days'}
            </span>
            <span className="block text-xs text-zinc-500">Current streak</span>
          </span>
        </button>
        <button type="button" onClick={() => onNavigate('Accountability', 'Weekly Log')} className="flex items-center gap-3 p-3.5 text-left">
          <IconChip icon={CheckSquare} tone="muted" />
          <span>
            <span className="block text-lg font-extrabold leading-tight text-black dark:text-zinc-50">
              {habits.length === 0 ? '—' : `${habitsDoneToday} of ${habits.length}`}
            </span>
            <span className="block text-xs text-zinc-500">Habits today</span>
          </span>
        </button>
      </Card>

      {!isCoachView && pendingForms > 0 && (
        <button
          type="button"
          onClick={() => onNavigate('Accountability', 'Forms')}
          className="flex w-full items-center justify-between gap-3 rounded-2xl border border-warning/30 bg-warning/10 px-4 py-3 text-left"
        >
          <span className="flex items-center gap-2.5">
            <Camera className="h-4 w-4 text-warning" />
            <span className="text-sm font-semibold text-black dark:text-zinc-50">
              {pendingForms} form{pendingForms === 1 ? '' : 's'} to complete
            </span>
          </span>
          <span className="text-xs font-bold text-warning">Open</span>
        </button>
      )}

      {isCoachView && (
      <div className="grid grid-cols-2 gap-3">
        {isCoachView && (onNavigateClasses ? (
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
        ))}

        <button type="button" onClick={() => onNavigate('Accountability', 'Forms')} className={clickableCardCls}>
          <p className={`${labelCls} flex items-center gap-1.5`}>
            <Camera className="h-4 w-4 text-accent" />
            Pending forms
          </p>
          <p className={valueCls}>{pendingForms}</p>
        </button>
      </div>
      )}

      {isCoachView && <BigDogCard results={bigDogResults} onOpen={() => onNavigate('Achievements')} />}

      {!isCoachView && (
        <BpHomeSections
          bookings={bookings}
          membership={membership}
          rewards={rewards}
          onNavigate={onNavigate}
        />
      )}
    </div>
  );
}
