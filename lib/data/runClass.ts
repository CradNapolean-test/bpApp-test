'use server';

import { createClient } from '@/lib/supabase/server';
import { getRoster } from './classes';
import { raise } from './errors';
import { describeChoices } from '@/lib/workoutSections';
import { daysBetween } from '@/lib/utils/dates';
import type { RosterEntry, WorkoutExerciseRow, WorkoutProgramRow } from './types';

// Everything the coach needs while a class is on: who is in, which workout it is, what each member chose
// for the Strong / Conditioning blocks, and what each has lifted before on the day's exercises.

export interface HistorySession {
  date: string;
  sets: { reps: number | null; load: number | null }[];
}

export interface RunClassMember extends RosterEntry {
  // What they picked for the two 10-minute slots ("Strong, then Conditioning"); null until they pick.
  picks: { text: string; switched: boolean } | null;
  // The blocks they picked, e.g. ['strong:1', 'conditioning:2'], so the screen shows only their exercises.
  chosenKeys: string[];
  // Their last few sessions per exercise (by library id or lower-case name), newest first.
  history: Record<string, HistorySession[]>;
}

export interface RunClassData {
  className: string;
  date: string;
  startTime: string | null;
  workout: { programName: string; dayLabel: string; weekNum: number; exercises: WorkoutExerciseRow[] } | null;
  members: RunClassMember[];
}

const SESSIONS_SHOWN = 3;

function startOf(p: WorkoutProgramRow): string {
  return p.start_date ?? p.created_at.slice(0, 10);
}

// The programme a member follows on a given date, and which of its days falls on that weekday.
function resolveDay(programs: WorkoutProgramRow[], date: string, weekday: number) {
  const current = programs
    .filter((p) => startOf(p) <= date)
    .sort((a, b) => startOf(b).localeCompare(startOf(a)) || b.created_at.localeCompare(a.created_at))[0];
  if (!current) return null;
  const weekNum = Math.floor(daysBetween(startOf(current), date) / 7) + 1;
  const day = current.workout_program_days.find((d) => d.week_num === weekNum && d.day_position === weekday);
  return day ? { program: current, day, weekNum } : null;
}

export async function getRunClassData(classId: string, date: string): Promise<RunClassData> {
  const supabase = await createClient();
  const { data: cls, error: classError } = await supabase.from('classes').select('name, start_time').eq('id', classId).single();
  if (classError || !cls) raise(classError ?? new Error('Class not found'));

  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  const roster = (await getRoster(classId, date)).filter((r) => r.status !== 'cancelled');
  const clientIds = roster.map((r) => r.clientId);

  const programSelect = '*, workout_program_days(*, workout_exercises(*))';
  const { data: memberPrograms, error: programError } = clientIds.length
    ? await supabase.from('workout_programs').select(programSelect).in('client_id', clientIds)
    : { data: [] as WorkoutProgramRow[], error: null };
  if (programError) raise(programError);
  const byClient = new Map<string, WorkoutProgramRow[]>();
  for (const p of (memberPrograms ?? []) as WorkoutProgramRow[]) byClient.set(p.client_id, [...(byClient.get(p.client_id) ?? []), p]);

  const dayOf = new Map(roster.map((r) => [r.clientId, resolveDay(byClient.get(r.clientId) ?? [], date, weekday)]));
  let shown = [...dayOf.values()].find((d) => d) ?? null;

  // Nobody booked (or nobody has a programme yet): show the workout from any programme the coach can see.
  if (!shown) {
    const { data: recent } = await supabase.from('workout_programs').select(programSelect).order('created_at', { ascending: false }).limit(40);
    const byOwner = new Map<string, WorkoutProgramRow[]>();
    for (const p of (recent ?? []) as WorkoutProgramRow[]) byOwner.set(p.client_id, [...(byOwner.get(p.client_id) ?? []), p]);
    for (const programs of byOwner.values()) {
      shown = resolveDay(programs, date, weekday);
      if (shown) break;
    }
  }

  const dayIds = [...dayOf.values()].filter((d): d is NonNullable<typeof d> => !!d).map((d) => d.day.id);
  const { data: choiceRows } = dayIds.length
    ? await supabase.from('workout_block_choices').select('client_id, program_day_id, slot, block_key').in('program_day_id', dayIds)
    : { data: [] as { client_id: string; program_day_id: string; slot: number; block_key: string }[] };

  // Earlier sessions of every exercise, for each booked member. A log counts for an exercise by library id, or
  // by name for older logs that were saved without one, so history is keyed by both.
  const { data: logRows } = clientIds.length
    ? await supabase
        .from('workout_logs')
        .select('client_id, exercise_library_id, actual_reps, actual_load, logged_at, workout_exercises(exercise_library_id, name)')
        .in('client_id', clientIds)
        .eq('set_type', 'working')
        .lt('logged_at', date)
        .order('logged_at', { ascending: false })
        .limit(6000)
    : { data: [] };

  const historyOf = new Map<string, Record<string, HistorySession[]>>();
  for (const row of (logRows ?? []) as unknown as {
    client_id: string;
    exercise_library_id: string | null;
    actual_reps: number | null;
    actual_load: number | null;
    logged_at: string;
    workout_exercises: { exercise_library_id: string | null; name: string } | { exercise_library_id: string | null; name: string }[] | null;
  }[]) {
    const ex = Array.isArray(row.workout_exercises) ? row.workout_exercises[0] : row.workout_exercises;
    const keys = [row.exercise_library_id ?? ex?.exercise_library_id, ex?.name?.trim().toLowerCase()].filter((k): k is string => !!k);
    const perClient = historyOf.get(row.client_id) ?? {};
    historyOf.set(row.client_id, perClient);
    const day = row.logged_at.slice(0, 10);
    for (const key of new Set(keys)) {
      const sessions = (perClient[key] ??= []);
      let session = sessions.find((x) => x.date === day);
      if (!session) {
        if (sessions.length >= SESSIONS_SHOWN) continue;
        session = { date: day, sets: [] };
        sessions.push(session);
      }
      session.sets.push({ reps: row.actual_reps, load: row.actual_load });
    }
  }
  for (const perClient of historyOf.values()) {
    for (const sessions of Object.values(perClient)) {
      // Newest day first; within a day the sets read in the order they were done (logged newest-first above).
      sessions.sort((a, b) => b.date.localeCompare(a.date));
      for (const s of sessions) s.sets.reverse();
    }
  }

  const members: RunClassMember[] = roster.map((r) => {
    const day = dayOf.get(r.clientId);
    const mine = (choiceRows ?? []).filter((c) => c.client_id === r.clientId && c.program_day_id === day?.day.id);
    const slot1 = mine.find((c) => c.slot === 1)?.block_key ?? null;
    const slot2 = mine.find((c) => c.slot === 2)?.block_key ?? null;
    return {
      ...r,
      picks: describeChoices(slot1, slot2),
      chosenKeys: slot1 === 'conditioning:0' ? [slot1] : [slot1, slot2].filter((k): k is string => !!k),
      history: historyOf.get(r.clientId) ?? {},
    };
  });

  return {
    className: cls.name,
    date,
    startTime: cls.start_time,
    workout: shown
      ? {
          programName: shown.program.name,
          dayLabel: shown.day.day_label,
          weekNum: shown.weekNum,
          exercises: [...shown.day.workout_exercises].sort((a, b) => a.sort_order - b.sort_order),
        }
      : null,
    members,
  };
}
