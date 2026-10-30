import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback } from 'react';

import type {
  ClientExerciseMaxRow,
  ExerciseLibraryRow,
  SetType,
  WorkoutBlockChoiceRow,
  WorkoutBlockResultRow,
  WorkoutDayFeedbackRow,
  WorkoutExerciseRow,
  WorkoutLogRow,
  WorkoutProgramDayRow,
  WorkoutProgramRow,
} from '@ballistic/shared/data/types';
import { pickCurrentProgram } from '@ballistic/shared/utils/currentProgram';
import { workoutWindowStart } from '@ballistic/shared/utils/trainingWindow';
import type { OverviewExercise } from '@ballistic/shared/utils/programOverview';
import type { ExerciseRef } from '@ballistic/shared/utils/workoutHistory';

import { workoutDayKey } from '@/lib/queryKeys';
import {
  WRITE_BLOCK_CHOICE,
  WRITE_BLOCK_RESULT,
  WRITE_BLOCK_RESULT_DELETE,
  WRITE_SESSION_FEEDBACK,
  WRITE_SET_DELETE,
  WRITE_SET_LOG,
  WRITE_SET_UPDATE,
  type BlockChoiceVars,
  type BlockResultDeleteVars,
  type BlockResultVars,
  type SessionFeedbackVars,
  type SetDeleteVars,
  type SetFields,
  type SetLogVars,
  type SetUpdateVars,
} from '@/lib/queuedWrites';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useQueuedWrite } from '@/lib/writeQueue';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

const chunk = <T,>(arr: T[], n: number): T[][] => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

// ---------- the programme overview (week pills + day cards) ----------
export type ProgramOverview = {
  current: { id: string; name: string; start_date: string | null; totalWeeks: number } | null;
  upcoming: { id: string; name: string; start_date: string | null }[];
  days: Pick<WorkoutProgramDayRow, 'id' | 'week_num' | 'day_label' | 'phase_label' | 'day_position' | 'notes'>[];
  exercisesByDay: Record<string, OverviewExercise[]>;
  loggedExerciseIds: string[];
  choices: Pick<WorkoutBlockChoiceRow, 'program_day_id' | 'slot' | 'block_key'>[];
};

// Programme, its days, a light list of each day's exercises, and which have a set logged. No set history, library
// or maxes: those load only when a day is opened.
export function useProgramOverview(todayIso: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['program-overview', userId, todayIso],
    enabled,
    queryFn: async (): Promise<ProgramOverview> => {
      const programsRes = await supabase.from('workout_programs').select('id, client_id, name, created_at, start_date').eq('client_id', userId);
      if (programsRes.error) throw programsRes.error;
      const programs = (programsRes.data ?? []).map((p) => ({ ...(p as Omit<WorkoutProgramRow, 'workout_program_days'>), workout_program_days: [] as WorkoutProgramDayRow[] }));
      const { current, upcoming } = pickCurrentProgram(programs, todayIso);
      const upcomingOut = upcoming.map((u) => ({ id: u.id, name: u.name, start_date: u.start_date }));
      if (!current) return { current: null, upcoming: upcomingOut, days: [], exercisesByDay: {}, loggedExerciseIds: [], choices: [] };

      const daysRes = await supabase
        .from('workout_program_days')
        .select('id, week_num, day_label, phase_label, day_position, notes')
        .eq('program_id', current.id);
      if (daysRes.error) throw daysRes.error;
      const days = (daysRes.data ?? []) as ProgramOverview['days'];
      const dayIds = days.map((d) => d.id);

      const [exRes, choicesRes] = await Promise.all([
        supabase.from('workout_exercises').select('id, program_day_id, name, block_type, sort_order, section, block_no, block_part, block_format').in('program_day_id', dayIds),
        supabase.from('workout_block_choices').select('program_day_id, slot, block_key').eq('client_id', userId),
      ]);
      if (exRes.error) throw exRes.error;
      const exercisesByDay: Record<string, OverviewExercise[]> = {};
      const exerciseIds: string[] = [];
      for (const e of (exRes.data ?? []) as (OverviewExercise & { program_day_id: string })[]) {
        (exercisesByDay[e.program_day_id] ??= []).push(e);
        exerciseIds.push(e.id);
      }
      // Which exercises have at least one set. Chunked so the request URL stays short.
      const logParts = await Promise.all(chunk(exerciseIds, 80).map((ids) => supabase.from('workout_logs').select('exercise_id').in('exercise_id', ids)));
      const logged = new Set<string>();
      for (const part of logParts) {
        if (part.error) throw part.error;
        for (const r of part.data ?? []) if (r.exercise_id) logged.add(r.exercise_id as string);
      }
      const totalWeeks = Math.max(0, ...days.map((d) => d.week_num));
      return {
        current: { id: current.id, name: current.name, start_date: current.start_date, totalWeeks },
        upcoming: upcomingOut,
        days,
        exercisesByDay,
        loggedExerciseIds: [...logged],
        choices: (choicesRes.data ?? []) as ProgramOverview['choices'],
      };
    },
  });
}

// ---------- one open day ----------
export type WorkoutDayData = {
  day: WorkoutProgramDayRow;
  exercises: WorkoutExerciseRow[];
  // This day's own logged sets.
  logs: WorkoutLogRow[];
  // Sets from OTHER sessions of the same exercises (for "last time" and "new best").
  history: WorkoutLogRow[];
  // id -> {name, library id} for the exercises in `history` and this day.
  refs: Record<string, ExerciseRef>;
  library: Record<string, Pick<ExerciseLibraryRow, 'id' | 'name' | 'video_url' | 'image_url' | 'muscle_group'>>;
  maxes: ClientExerciseMaxRow[];
  // The heaviest working load per exercise from BEFORE the 90 days of history this screen carries (migration 0137), keyed by library id or "n:<name>".
  priorBests: Record<string, number>;
  feedback: WorkoutDayFeedbackRow | null;
  choices: { slot1: string | null; slot2: string | null };
  // What the member scored on each block of this workout (migration 0152).
  results: WorkoutBlockResultRow[];
};

export function useWorkoutDay(dayId: string) {
  const userId = useUserId();
  return useQuery({
    queryKey: workoutDayKey(userId, dayId),
    staleTime: 60_000,
    queryFn: async (): Promise<WorkoutDayData> => {
      // Stage 1: the day, its exercises, the member's rating and block picks.
      const [dayRes, exRes, fbRes, choiceRes, resultRes] = await Promise.all([
        supabase.from('workout_program_days').select('*').eq('id', dayId).single(),
        supabase.from('workout_exercises').select('*').eq('program_day_id', dayId).order('sort_order', { ascending: true }),
        supabase.from('workout_day_feedback').select('*').eq('client_id', userId).eq('program_day_id', dayId).maybeSingle(),
        supabase.from('workout_block_choices').select('slot, block_key').eq('client_id', userId).eq('program_day_id', dayId),
        supabase.from('workout_block_results').select('*').eq('client_id', userId).eq('program_day_id', dayId),
      ]);
      if (dayRes.error) throw dayRes.error;
      if (exRes.error) throw exRes.error;
      const exercises = (exRes.data ?? []) as WorkoutExerciseRow[];
      const exIds = exercises.map((e) => e.id);
      const libIds = [...new Set(exercises.map((e) => e.exercise_library_id).filter((x): x is string => !!x))];
      const names = [...new Set(exercises.map((e) => e.name))];

      // Stage 2: this day's logs, library entries (videos), maxes, and the same exercises in other weeks.
      const [logsRes, libRes, maxRes, siblingsByName, siblingsByLib] = await Promise.all([
        exIds.length ? supabase.from('workout_logs').select('*').in('exercise_id', exIds).order('logged_at', { ascending: true }) : Promise.resolve({ data: [], error: null }),
        libIds.length ? supabase.from('exercise_library').select('id, name, video_url, image_url, muscle_group').in('id', libIds) : Promise.resolve({ data: [], error: null }),
        libIds.length ? supabase.from('client_exercise_maxes').select('*').eq('client_id', userId).in('exercise_library_id', libIds) : Promise.resolve({ data: [], error: null }),
        names.length ? supabase.from('workout_exercises').select('id, name, exercise_library_id').in('name', names) : Promise.resolve({ data: [], error: null }),
        libIds.length ? supabase.from('workout_exercises').select('id, name, exercise_library_id').in('exercise_library_id', libIds) : Promise.resolve({ data: [], error: null }),
      ]);
      for (const r of [logsRes, libRes, maxRes, siblingsByName, siblingsByLib]) if (r.error) throw r.error;

      const refs: Record<string, ExerciseRef> = {};
      for (const e of exercises) refs[e.id] = { name: e.name, exercise_library_id: e.exercise_library_id };
      for (const s of [...(siblingsByName.data ?? []), ...(siblingsByLib.data ?? [])] as { id: string; name: string; exercise_library_id: string | null }[]) refs[s.id] = { name: s.name, exercise_library_id: s.exercise_library_id };
      const siblingIds = Object.keys(refs).filter((id) => !exIds.includes(id));

      // Stage 3: sets from those other sessions (and any logged against the same library entry directly). Only the last 90 days are read (H5):
      // every set is a row, so an unbounded read hits the database's 1,000-row limit after a few months and silently drops sets. What came
      // before the window arrives as the all-time bests below, so a personal best is still a true one.
      const windowStart = workoutWindowStart(new Date().toISOString().slice(0, 10));
      const [byEx, byLib, bestsRes] = await Promise.all([
        Promise.all(chunk(siblingIds, 80).map((ids) => supabase.from('workout_logs').select('*').in('exercise_id', ids).gte('logged_at', windowStart).order('logged_at', { ascending: false }).limit(1000))),
        libIds.length ? supabase.from('workout_logs').select('*').eq('client_id', userId).in('exercise_library_id', libIds).gte('logged_at', windowStart).order('logged_at', { ascending: false }).limit(1000) : Promise.resolve({ data: [], error: null }),
        supabase.rpc('member_strength_bests', { p_client: userId, p_before: windowStart }),
      ]);
      const history = new Map<string, WorkoutLogRow>();
      for (const part of byEx) {
        if (part.error) throw part.error;
        for (const l of (part.data ?? []) as WorkoutLogRow[]) history.set(l.id, l);
      }
      if (byLib.error) throw byLib.error;
      for (const l of (byLib.data ?? []) as WorkoutLogRow[]) if (!l.exercise_id || !exIds.includes(l.exercise_id)) history.set(l.id, l);

      // If the bests cannot be read the screen still works; a PR is then judged against the window alone.
      const priorBests: Record<string, number> = {};
      for (const b of (bestsRes.data ?? []) as { exercise_key: string; best_load: number | string }[]) priorBests[b.exercise_key] = Number(b.best_load);

      const picks = (choiceRes.data ?? []) as { slot: 1 | 2; block_key: string }[];
      return {
        day: dayRes.data as WorkoutProgramDayRow,
        exercises,
        logs: (logsRes.data ?? []) as WorkoutLogRow[],
        history: [...history.values()],
        refs,
        library: Object.fromEntries(((libRes.data ?? []) as WorkoutDayData['library'][string][]).map((l) => [l.id, l])),
        maxes: (maxRes.data ?? []) as ClientExerciseMaxRow[],
        priorBests,
        feedback: (fbRes.data as WorkoutDayFeedbackRow | null) ?? null,
        choices: { slot1: picks.find((p) => p.slot === 1)?.block_key ?? null, slot2: picks.find((p) => p.slot === 2)?.block_key ?? null },
        // If the results cannot be read the workout still works; the block just shows no saved result.
        results: (resultRes.data ?? []) as WorkoutBlockResultRow[],
      };
    },
  });
}

// ---------- writes ----------
// Every write on the workout screen works with no signal (lib/queuedWrites.ts, lib/writeQueue.ts): the screen changes at once
// (cancelling any fetch in flight first, so it cannot overwrite the change) and the write waits for a connection if there is
// none. A set carries an id made on the phone, so what the screen shows is the row that will exist on the server, and
// logged_at is when the set was done, not when it reached the server.
function useDayCacheUpdate(dayId: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useCallback(
    async (update: (old: WorkoutDayData) => WorkoutDayData) => {
      const key = workoutDayKey(userId, dayId);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<WorkoutDayData>(key, (old) => (old ? update(old) : old));
    },
    [qc, userId, dayId],
  );
}

type LogSetInput = { exercise: Pick<WorkoutExerciseRow, 'id' | 'exercise_library_id'>; setNumber: number; setType?: SetType } & SetFields;

export function useLogSet(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback(
    (v: LogSetInput): SetLogVars => ({
      userId,
      dayId,
      row: {
        id: randomUUID(),
        logged_at: new Date().toISOString(),
        exercise_id: v.exercise.id,
        exercise_library_id: v.exercise.exercise_library_id,
        set_number: v.setNumber,
        set_type: v.setType ?? 'working',
        actual_reps: v.actual_reps,
        actual_load: v.actual_load,
        actual_rpe: v.actual_rpe,
        actual_seconds: v.actual_seconds ?? null,
        actual_distance: v.actual_distance ?? null,
        actual_calories: v.actual_calories ?? null,
      },
    }),
    [userId, dayId],
  );
  const apply = useCallback(
    (_v: LogSetInput, vars: SetLogVars) => updateDay((old) => ({ ...old, logs: [...old.logs, { ...vars.row, client_id: userId }] })),
    [updateDay, userId],
  );
  return useQueuedWrite({ key: WRITE_SET_LOG, toVars, apply });
}

export function useUpdateSet(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback((v: { logId: string } & SetFields): SetUpdateVars => ({ userId, dayId, ...v }), [userId, dayId]);
  const apply = useCallback(
    (v: { logId: string } & SetFields) =>
      updateDay((old) => ({ ...old, logs: old.logs.map((l) => (l.id === v.logId ? { ...l, actual_reps: v.actual_reps, actual_load: v.actual_load, actual_rpe: v.actual_rpe, actual_seconds: v.actual_seconds ?? null, actual_distance: v.actual_distance ?? null, actual_calories: v.actual_calories ?? null } : l)) })),
    [updateDay],
  );
  return useQueuedWrite({ key: WRITE_SET_UPDATE, toVars, apply });
}

export function useDeleteSet(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback((v: { logId: string }): SetDeleteVars => ({ userId, dayId, logId: v.logId }), [userId, dayId]);
  const apply = useCallback((v: { logId: string }) => updateDay((old) => ({ ...old, logs: old.logs.filter((l) => l.id !== v.logId) })), [updateDay]);
  return useQueuedWrite({ key: WRITE_SET_DELETE, toVars, apply });
}

// Picks (or changes) what the member did in slot 1 or 2. One long conditioning block covers both slots, so choosing
// it clears any slot 2 pick.
export function useChooseBlock(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback(
    (v: { slot: 1 | 2; blockKey: string }): BlockChoiceVars => ({ userId, dayId, slot: v.slot, blockKey: v.blockKey, chosenAt: new Date().toISOString() }),
    [userId, dayId],
  );
  const apply = useCallback(
    (v: { slot: 1 | 2; blockKey: string }) =>
      updateDay((old) => {
        const next = { ...old.choices, [v.slot === 1 ? 'slot1' : 'slot2']: v.blockKey };
        if (v.slot === 1 && v.blockKey === 'conditioning:0') next.slot2 = null;
        return { ...old, choices: next };
      }),
    [updateDay],
  );
  return useQueuedWrite({ key: WRITE_BLOCK_CHOICE, toVars, apply });
}

// Saves (or changes) what the member scored on a block. The saved result shows at once and the write waits for a connection if there
// is none.
type BlockResultInput = Omit<BlockResultVars, 'userId' | 'dayId' | 'loggedAt'>;
export function useSaveBlockResult(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback((v: BlockResultInput): BlockResultVars => ({ userId, dayId, ...v, loggedAt: new Date().toISOString() }), [userId, dayId]);
  const apply = useCallback(
    (_v: BlockResultInput, vars: BlockResultVars) =>
      updateDay((old) => {
        const row: WorkoutBlockResultRow = {
          id: old.results.find((r) => r.block_key === vars.blockKey)?.id ?? randomUUID(),
          client_id: userId,
          program_day_id: dayId,
          block_key: vars.blockKey,
          format: vars.format,
          scoring: vars.scoring,
          rounds: vars.rounds,
          reps: vars.reps,
          seconds: vars.seconds,
          score: vars.score,
          done: vars.done,
          logged_at: vars.loggedAt,
        };
        return { ...old, results: [...old.results.filter((r) => r.block_key !== vars.blockKey), row] };
      }),
    [updateDay, userId, dayId],
  );
  return useQueuedWrite({ key: WRITE_BLOCK_RESULT, toVars, apply });
}

export function useDeleteBlockResult(dayId: string) {
  const userId = useUserId();
  const updateDay = useDayCacheUpdate(dayId);
  const toVars = useCallback((v: { blockKey: string }): BlockResultDeleteVars => ({ userId, dayId, blockKey: v.blockKey }), [userId, dayId]);
  const apply = useCallback((v: { blockKey: string }) => updateDay((old) => ({ ...old, results: old.results.filter((r) => r.block_key !== v.blockKey) })), [updateDay]);
  return useQueuedWrite({ key: WRITE_BLOCK_RESULT_DELETE, toVars, apply });
}

// "Rate this session": one row per member and day (upsert). The form keeps showing what was typed, so nothing is changed on
// screen up front.
export function useSaveFeedback(dayId: string) {
  const userId = useUserId();
  const toVars = useCallback((v: { sessionRpe: number | null; notes: string | null }): SessionFeedbackVars => ({ userId, dayId, ...v }), [userId, dayId]);
  return useQueuedWrite({ key: WRITE_SESSION_FEEDBACK, toVars, apply: noChangeOnScreen });
}

const noChangeOnScreen = () => {};

// ---------- tested maxes ----------
export function useExerciseLibrary(enabled: boolean) {
  return useQuery({
    queryKey: ['exercise-library'],
    enabled,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<Pick<ExerciseLibraryRow, 'id' | 'name'>[]> => {
      const { data, error } = await supabase.from('exercise_library').select('id, name').order('name');
      if (error) throw error;
      return (data ?? []) as Pick<ExerciseLibraryRow, 'id' | 'name'>[];
    },
  });
}

export function useRecordMax() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { exerciseLibraryId: string; testedMax: number; reps: number; isEstimated: boolean }) => {
      const { error } = await supabase.from('client_exercise_maxes').insert({
        client_id: userId, exercise_library_id: v.exerciseLibraryId, tested_max: v.testedMax, is_estimated: v.isEstimated, reps: v.reps,
      });
      if (error) throw error;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['workout-day', userId] }),
  });
}
