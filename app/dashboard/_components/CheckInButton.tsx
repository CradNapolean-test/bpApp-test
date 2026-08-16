'use client';

import { resolveCheckinTarget } from '@/lib/utils/checkin';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import type { ClassRow, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

// Never silently absent -- a client who expects to check in should understand *why* there's
// no button, not wonder if something's broken.
const REASON_TEXT: Record<'not_linked' | 'no_active_program' | 'no_matching_day', string> = {
  not_linked: "This class doesn't have a day of the week set yet — ask your coach.",
  no_active_program: "You don't have an active programme running right now.",
  no_matching_day: "Your programme doesn't have a workout set for this day of the week yet.",
};

export function CheckInButton({
  classRow,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
}: {
  classRow: ClassRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
}) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  const resolution = resolveCheckinTarget(programs, workoutLogs, classRow?.day_of_week ?? null, todayIso, tz);

  if (resolution.status === 'already_logged') {
    return <p className="text-xs font-medium text-accent">Already logged today ✓</p>;
  }
  if (resolution.status === 'ready') {
    return (
      <button
        onClick={() => onCheckIn(resolution.dayId)}
        className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground"
      >
        Check in
      </button>
    );
  }
  return <p className="text-xs text-zinc-500">{REASON_TEXT[resolution.status]}</p>;
}
