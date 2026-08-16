import { EmptyState } from '@/app/_components/EmptyState';
import { resolveActiveProgram } from '@/lib/utils/checkin';
import { DEFAULT_TIMEZONE, formatClassTime, todayIsoInTz } from '@/lib/utils/dates';
import type { BookingRow, WorkoutProgramRow } from '@/lib/data/types';

// Read-only, both sections derived from data the client already has -- see
// docs/PT_DISTINCTION_LAYOUT_ROADMAP.md's Phase 2 note on why training days are grouped by
// week rather than shown on a literal calendar: workout_program_days only carries an
// abstract day_position "slot", which only resolves to a real date once a class links to it.
export function ScheduleTab({
  bookings,
  programs,
  timezone,
}: {
  bookings: BookingRow[];
  programs: WorkoutProgramRow[];
  timezone?: string | null;
}) {
  // The client's own timezone, matching how their dashboard resolves "today" (see
  // lib/data/dashboardBundle.ts) -- not the coach's browser time, which could disagree near a
  // day boundary and show the coach a different upcoming-classes/active-week list than the
  // client actually sees.
  const todayIso = todayIsoInTz(timezone ?? DEFAULT_TIMEZONE);

  const upcomingBookings = bookings
    .filter((b) => b.booking_date >= todayIso)
    .sort((a, b) => (a.booking_date < b.booking_date ? -1 : a.booking_date > b.booking_date ? 1 : 0));

  const active = resolveActiveProgram(programs, todayIso);
  const weekDays = active
    ? [...active.program.workout_program_days]
        .filter((d) => d.week_num === active.weekNum)
        .sort((a, b) => (a.day_position ?? a.sort_order) - (b.day_position ?? b.sort_order))
    : [];

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-black dark:text-zinc-50">Upcoming classes</h3>
        <div className="mt-3 space-y-2">
          {upcomingBookings.length === 0 && <EmptyState title="No upcoming classes booked." compact />}
          {upcomingBookings.map((b) => (
            <div key={b.id} className="flex items-center justify-between gap-2 rounded-md border border-black/5 p-2.5 dark:border-white/5">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{b.class?.name ?? 'Class'}</p>
              <p className="text-sm text-zinc-500">
                {new Date(b.booking_date + 'T00:00:00Z').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                {b.class?.start_time && ` · ${formatClassTime(b.class.start_time)}`}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-black dark:text-zinc-50">
          This week&apos;s training{active && ` — Week ${active.weekNum}`}
        </h3>
        <div className="mt-3 space-y-2">
          {!active && <EmptyState title="No active program this week." compact />}
          {active && weekDays.length === 0 && <EmptyState title="No days scheduled for this week." compact />}
          {weekDays.map((day) => (
            <div key={day.id} className="flex items-center justify-between gap-2 rounded-md border border-black/5 p-2.5 dark:border-white/5">
              <p className="text-sm font-medium text-black dark:text-zinc-50">{day.day_label}</p>
              <p className="text-sm text-zinc-500">{day.workout_exercises.length} exercises</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
