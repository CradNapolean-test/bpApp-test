'use client';

import { useEffect, useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { checkInToSession } from '@/lib/data/classes';
import { resolveCheckinTarget } from '@/lib/utils/checkin';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { formatClock, nowLocalMs } from '@/lib/utils/cancelDeadline';
import type { ClassRow, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

// Shown under the button when there is no workout to open, so a member understands why tapping
// only checks them in.
const REASON_TEXT: Record<'not_linked' | 'no_active_program' | 'no_matching_day', string> = {
  not_linked: "This class doesn't have a day of the week set yet — ask your coach.",
  no_active_program: "You don't have an active programme running right now.",
  no_matching_day: "Your programme doesn't have a workout set for this day of the week yet.",
};

// Check-in is only offered around the session itself: it opens shortly before the start and
// closes a little after, so the programme opens when someone is actually turning up.
export const CHECKIN_OPENS_BEFORE_MIN = 2;
export const CHECKIN_CLOSES_AFTER_MIN = 15;

// Checking in marks the member's booking as attended (so the coach doesn't have to) and, when
// their programme has a workout for the day, opens it.
export function CheckInButton({
  classRow,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
  date,
  attended = false,
}: {
  classRow: ClassRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
  date?: string;
  // The booking is already marked attended (checked in, or marked by the coach).
  attended?: boolean;
}) {
  const { run, busy } = useAction();
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  // Re-render every 15s so the button appears/disappears without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const resolution = resolveCheckinTarget(
    programs,
    workoutLogs,
    // Fall back to the booking date's weekday so a session with no weekday set still works.
    classRow?.day_of_week ?? new Date(`${date ?? todayIso}T00:00:00Z`).getUTCDay(),
    todayIso,
    tz
  );
  const reason = resolution.status === 'not_linked' || resolution.status === 'no_active_program' || resolution.status === 'no_matching_day' ? REASON_TEXT[resolution.status] : null;
  const dayId = resolution.status === 'ready' || resolution.status === 'already_logged' ? resolution.dayId : null;

  if (attended) {
    return (
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-success">Checked in ✓</p>
        {dayId && (
          <button type="button" onClick={() => onCheckIn(dayId)} className="text-xs font-bold text-accent">
            {resolution.status === 'already_logged' ? 'View workout' : "Open today's workout"}
          </button>
        )}
      </div>
    );
  }

  // No start time on the session: nothing to gate on, so check-in is open all day.
  const hasTime = !!classRow?.start_time;
  const [h, m] = (classRow?.start_time ?? '00:00').split(':').map(Number);
  const startMs = Date.parse(`${date ?? todayIso}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
  const now = nowLocalMs(tz);
  if (hasTime && now < startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000) {
    return (
      <p className="text-xs text-zinc-500">
        Check-in opens at {formatClock(new Date(startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000).toISOString().slice(11, 16))}
      </p>
    );
  }
  if (hasTime && now > startMs + CHECKIN_CLOSES_AFTER_MIN * 60_000) {
    return <p className="text-xs text-zinc-500">Check-in has closed for this session.</p>;
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        disabled={busy || !classRow}
        onClick={() =>
          classRow &&
          run(() => checkInToSession(classRow.id, date ?? todayIso), {
            success: "You're checked in",
            onDone: () => dayId && onCheckIn(dayId),
          })
        }
        className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-60"
      >
        {busy ? 'Checking in…' : dayId ? "Check in & open today's workout" : 'Check in'}
      </button>
      {reason && <p className="text-xs text-zinc-500">{reason}</p>}
    </div>
  );
}
