'use client';

import { useEffect } from 'react';
import { weeklyTarget } from '@/lib/calculations';
import { toEngineProfile } from '@/lib/utils/clientProfile';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { resolveActiveProgram, resolveProgramDayByPosition } from '@/lib/utils/checkin';
import type { ClientProfileRow, DailyLogRow, WorkoutProgramRow } from '@/lib/data/types';

export const OFFLINE_SNAPSHOT_KEY = 'bp-offline-snapshot';

// Keeps a small copy of "today" (daily targets and today's workout) in this phone's storage, so the
// offline page (public/offline.html) can still show them in a gym basement with no signal. Nothing
// else is stored, and it is removed on sign-out. Renders nothing.
export function OfflineSnapshot({
  name,
  profile,
  programWeek,
  programs,
  weekLogs,
}: {
  name: string;
  profile: ClientProfileRow | null;
  programWeek: number;
  programs: WorkoutProgramRow[];
  weekLogs: DailyLogRow[];
}) {
  useEffect(() => {
    try {
      const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
      const engine = toEngineProfile(profile);
      const target = engine ? weeklyTarget(engine, programWeek)?.dailyFlat ?? null : null;

      const todayDow = new Date(`${todayIso}T00:00:00Z`).getUTCDay();
      const active = resolveActiveProgram(programs, todayIso);
      const day = active ? resolveProgramDayByPosition(active.program, active.weekNum, todayDow) : null;
      const workout = day
        ? {
            label: day.day_label,
            exercises: [...day.workout_exercises]
              .filter((e) => e.block_type === 'exercise')
              .sort((a, b) => a.sort_order - b.sort_order)
              .map((e) => ({ name: e.name, sets: e.sets, reps: e.reps, load: e.load })),
          }
        : null;

      const todayLog = weekLogs.find((l) => l.log_date === todayIso);
      const eaten = todayLog
        ? Math.round((todayLog.protein ?? 0) * 4 + (todayLog.carbs ?? 0) * 4 + (todayLog.fat ?? 0) * 9)
        : 0;

      localStorage.setItem(
        OFFLINE_SNAPSHOT_KEY,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          date: todayIso,
          name: name.split(' ')[0],
          targets: target
            ? { calories: Math.round(target.calories), protein: Math.round(target.protein), carbs: Math.round(target.carbs), fat: Math.round(target.fat) }
            : null,
          eaten,
          workout,
        })
      );
    } catch {
      /* storage blocked or full: the offline page just won't show a plan */
    }
  }, [name, profile, programWeek, programs, weekLogs]);

  return null;
}
