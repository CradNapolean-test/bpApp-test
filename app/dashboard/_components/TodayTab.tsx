import { dayCalories } from '@/lib/calculations';
import { hasLoggedData } from '@/lib/utils/dailyLog';
import { toIsoDate, addDays } from '@/lib/utils/dates';
import type { BookingRow, ClientMembershipRow, DailyLogRow, FormAssignmentWithDetails, HabitWithLogs } from '@/lib/data/types';

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

const cardCls = 'rounded-lg border border-black/10 p-4 dark:border-white/10';
const labelCls = 'text-xs font-medium text-zinc-500';
const valueCls = 'mt-1 text-xl font-semibold text-black dark:text-zinc-50';

export function TodayTab({
  weekLogs,
  historyLogs,
  habits,
  formAssignments,
  bookings,
  creditsBalance,
  membership,
}: {
  weekLogs: DailyLogRow[];
  historyLogs: DailyLogRow[];
  habits: HabitWithLogs[];
  formAssignments: FormAssignmentWithDetails[];
  bookings: BookingRow[];
  creditsBalance: number;
  membership: ClientMembershipRow | null;
}) {
  const todayIso = toIsoDate(new Date());
  const todayLog = weekLogs.find((l) => l.log_date === todayIso);
  const todayCalories = todayLog ? dayCalories(todayLog.protein ?? 0, todayLog.carbs ?? 0, todayLog.fat ?? 0) : null;

  const streak = currentStreak(historyLogs, todayIso);

  const habitsDoneToday = habits.filter((h) => h.logs.find((l) => l.log_date === todayIso)?.completed).length;

  const pendingForms = formAssignments.filter((a) => !a.completed_at).length;

  const nextClass = bookings
    .filter((b) => b.status === 'booked' && b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')))[0];

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className={cardCls}>
        <p className={labelCls}>Today&apos;s nutrition</p>
        <p className={valueCls}>{todayCalories != null ? `${Math.round(todayCalories)} kcal` : 'Not logged'}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Current streak</p>
        <p className={valueCls}>{streak} {streak === 1 ? 'day' : 'days'}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Habits today</p>
        <p className={valueCls}>
          {habits.length === 0 ? '—' : `${habitsDoneToday} of ${habits.length}`}
        </p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Pending forms</p>
        <p className={valueCls}>{pendingForms}</p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Next class</p>
        <p className={valueCls}>
          {nextClass ? `${nextClass.class?.name} — ${nextClass.booking_date}` : 'None booked'}
        </p>
      </div>

      <div className={cardCls}>
        <p className={labelCls}>Credits</p>
        <p className={valueCls}>
          {creditsBalance}
          {membership?.package ? ` · ${membership.package.name}` : ''}
        </p>
      </div>
    </div>
  );
}
