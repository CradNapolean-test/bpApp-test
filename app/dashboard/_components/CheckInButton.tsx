'use client';

import { useEffect, useState } from 'react';
import { resolveCheckinTarget } from '@/lib/utils/checkin';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { formatClock, nowLocalMs } from '@/lib/utils/cancelDeadline';
import type { ClassRow, WorkoutLogRow, WorkoutProgramRow } from '@/lib/data/types';

// Never silently absent -- a client who expects to check in should understand *why* there's
// no button, not wonder if something's broken.
const REASON_TEXT: Record<'not_linked' | 'no_active_program' | 'no_matching_day', string> = {
  not_linked: "This class doesn't have a day of the week set yet — ask your coach.",
  no_active_program: "You don't have an active programme running right now.",
  no_matching_day: "Your programme doesn't have a workout set for this day of the week yet.",
};

// Check-in is only offered around the session itself: it opens shortly before the start and
// closes a little after, so the programme opens when someone is actually turning up.
export const CHECKIN_OPENS_BEFORE_MIN = 2;
export const CHECKIN_CLOSES_AFTER_MIN = 15;

export function CheckInButton({
  classRow,
  programs,
  workoutLogs,
  onCheckIn,
  timezone,
  date,
}: {
  classRow: ClassRow | null;
  programs: WorkoutProgramRow[];
  workoutLogs: WorkoutLogRow[];
  onCheckIn: (dayId: string) => void;
  timezone?: string | null;
  date?: string;
}) {
  const tz = timezone ?? DEFAULT_TIMEZONE;
  const todayIso = todayIsoInTz(tz);
  // Re-render every 15s so the button appears/disappears without a refresh.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 15_000);
    return () => clearInterval(id);
  }, []);
  const resolution = resolveCheckinTarget(programs, workoutLogs, classRow?.day_of_week ?? null, todayIso, tz);

  if (resolution.status === 'already_logged') {
    return <p className="text-xs font-medium text-accent">Already logged today ✓</p>;
  }
  if (resolution.status === 'ready') {
    const [h, m] = (classRow?.start_time ?? '00:00').split(':').map(Number);
    const startMs = Date.parse(`${date ?? todayIso}T00:00:00Z`) + (h * 60 + (m || 0)) * 60_000;
    const now = nowLocalMs(tz);
    if (now < startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000) {
      return (
        <p className="text-xs text-zinc-500">
          Check-in opens at {formatClock(new Date(startMs - CHECKIN_OPENS_BEFORE_MIN * 60_000).toISOString().slice(11, 16))}
        </p>
      );
    }
    if (now > startMs + CHECKIN_CLOSES_AFTER_MIN * 60_000) {
      return <p className="text-xs text-zinc-500">Check-in has closed for this session.</p>;
    }
    return (
      <button
        onClick={() => onCheckIn(resolution.dayId)}
        className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
      >
        Check in &amp; open today&apos;s programme
      </button>
    );
  }
  return <p className="text-xs text-zinc-500">{REASON_TEXT[resolution.status]}</p>;
}
