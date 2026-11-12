'use server';

import { createClient } from '@/lib/supabase/server';
import { getRoster } from './classes';
import { getMyClients, type CoachClientRow } from './coach';
import { raise } from './errors';
import { describeChoices } from '@/lib/workoutSections';
import { daysBetween } from '@/lib/utils/dates';
import { trackingOf } from '@/lib/workoutTracking';
import type { HistorySet, PastBlockResult } from '@/lib/runClassHistory';
import type { RosterEntry, WorkoutExerciseRow, WorkoutProgramRow } from './types';

// Everything the coach needs while a class is on: who is in, which workout it is, what each member chose
// for the Strong / Conditioning blocks, and what each has lifted before on the day's exercises.

export interface HistorySession {
  date: string;
  // Each set with the tracking type it was logged under, so time, distance, calories and ticks read right (CS18).
  sets: HistorySet[];
}

export interface RunClassMember extends RosterEntry {
  // What they picked for the two 10-minute slots ("Strong, then Conditioning"); null until they pick.
  picks: { text: string; switched: boolean } | null;
  // The blocks they picked, e.g. ['strong:1', 'conditioning:2'], so the screen shows only their exercises.
  chosenKeys: string[];
  // Their last few sessions per exercise (by library id or lower-case name), newest first.
  history: Record<string, HistorySession[]>;
  // Their earlier block results (workout_block_results, migration 0152), newest first, for the day's scored blocks (CS18).
  blockResults: PastBlockResult[];
}

export interface RunClassData {
  className: string;
  date: string;
  startTime: string | null;
  // For adding a walk-in (CS2): whether a place is free, and what it costs.
  capacity: number;
  creditCost: number;
  // The note typed on the session in the Timetable (CS4).
  coachNote: string | null;
  workout: { programName: string; dayLabel: string; weekNum: number; exercises: WorkoutExerciseRow[] } | null;
  members: RunClassMember[];
}

const SESSIONS_SHOWN = 3;

type LoggedExercise = { exercise_library_id: string | null; name: string; tracking_type: string | null };

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
  const { data: cls, error: classError } = await supabase.from('classes').select('name, start_time, capacity, credit_cost, coach_note').eq('id', classId).single();
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
        .select(
          'client_id, exercise_library_id, actual_reps, actual_load, actual_seconds, actual_distance, actual_calories, logged_at, workout_exercises(exercise_library_id, name, tracking_type)'
        )
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
    actual_seconds: number | null;
    actual_distance: number | null;
    actual_calories: number | null;
    logged_at: string;
    workout_exercises: LoggedExercise | LoggedExercise[] | null;
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
      session.sets.push({
        type: trackingOf(ex?.tracking_type),
        reps: row.actual_reps,
        load: row.actual_load,
        seconds: row.actual_seconds,
        distance: row.actual_distance,
        calories: row.actual_calories,
      });
    }
  }
  for (const perClient of historyOf.values()) {
    for (const sessions of Object.values(perClient)) {
      // Newest day first; within a day the sets read in the order they were done (logged newest-first above).
      sessions.sort((a, b) => b.date.localeCompare(a.date));
      for (const s of sessions) s.sets.reverse();
    }
  }

  // Earlier block results (AMRAP rounds, a time, a score), newest first. Read-only; a database without the table just shows none.
  const { data: resultRows } = clientIds.length
    ? await supabase
        .from('workout_block_results')
        .select('client_id, block_key, format, scoring, rounds, reps, seconds, score, done, logged_at')
        .in('client_id', clientIds)
        .lt('logged_at', date)
        .order('logged_at', { ascending: false })
        .limit(1000)
    : { data: [] };
  const resultsOf = new Map<string, PastBlockResult[]>();
  for (const row of (resultRows ?? []) as {
    client_id: string;
    block_key: string;
    format: string | null;
    scoring: PastBlockResult['scoring'];
    rounds: number | null;
    reps: number | null;
    seconds: number | null;
    score: number | null;
    done: boolean | null;
    logged_at: string;
  }[]) {
    const list = resultsOf.get(row.client_id) ?? [];
    resultsOf.set(row.client_id, list);
    list.push({
      blockKey: row.block_key,
      format: row.format,
      scoring: row.scoring,
      rounds: row.rounds,
      reps: row.reps,
      seconds: row.seconds,
      score: row.score,
      done: row.done,
      date: row.logged_at.slice(0, 10),
    });
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
      blockResults: resultsOf.get(r.clientId) ?? [],
    };
  });

  return {
    className: cls.name,
    date,
    startTime: cls.start_time,
    capacity: cls.capacity,
    creditCost: cls.credit_cost,
    coachNote: cls.coach_note ?? null,
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

// The members a coach can add to a session from Run this class (a walk-in, CS2), with their credit balances. Read when the coach opens
// the add panel, so the page itself stays as quick to load as before. The same list the Sessions pop-up uses.
export async function getWalkInCandidates(): Promise<CoachClientRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  return getMyClients(supabase, user.id);
}
