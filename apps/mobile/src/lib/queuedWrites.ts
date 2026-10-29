import type { FoodDiaryEntryRow, SetType } from '@ballistic/shared/data/types';
import { dayFieldsFromDiary, dayFieldsFromManual } from '@ballistic/shared/utils/foodTotals';
import { validateDayPatch, type DayPatch } from '@ballistic/shared/utils/weeklyLog';

import type { DiaryData } from '@/lib/food';
import { queryClient } from '@/lib/queryClient';
import { diaryKey, manualKey, workoutDayKey } from '@/lib/queryKeys';
import { supabase } from '@/lib/supabase';
import { defineWrite, insertOnce } from '@/lib/writeQueue';

// Every write that keeps working offline (see writeQueue.ts). Each is described by plain data (what is kept on the phone while
// it waits) and a function that carries it out. Importing this file registers them all, and it must be imported before the
// saved cache is restored (the root layout does), or a write kept from last time would have nothing to run it.
// Each one is safe to run twice.

// ---------- the food diary ----------

export async function getOrCreateLogId(userId: string, date: string): Promise<string> {
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert({ client_id: userId, log_date: date }, { onConflict: 'client_id,log_date' })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

// Writes the diary's running totals into that day's daily log (so Today, the weekly log and the floor checks
// reflect what was logged). Re-reads the entries from the database rather than trusting the cache.
// The day's calories are stored too, INCLUDING a Quick Add of "300 kcal, no split" (R11, migration 0136), and a day with no
// entries is written as nulls, not zeros, so a deleted food does not leave a "logged" day behind (M2).
export async function syncDiaryToLog(dailyLogId: string) {
  const { data, error } = await supabase.from('food_diary_entries').select('*, food:foods(*)').eq('daily_log_id', dailyLogId);
  if (error) throw error;
  const fields = dayFieldsFromDiary((data ?? []) as unknown as FoodDiaryEntryRow[]);
  const { error: updateError } = await supabase.from('daily_logs').update(fields).eq('id', dailyLogId);
  if (updateError) throw updateError;
}

// The day's log id from whichever diary screen already loaded it (the food diary or the manual macro diary), else get or create it.
const logIdFor = (userId: string, date: string) =>
  queryClient.getQueryData<DiaryData>(diaryKey(userId, date))?.dailyLogId ??
  queryClient.getQueryData<{ dailyLogId: string | null }>(manualKey(userId, date))?.dailyLogId ??
  getOrCreateLogId(userId, date);

// What is saved for one diary row. The id is made on the phone so a repeat cannot add the food twice, and created_at is when
// the member added it (not when it reached the server), which keeps the day's order.
export type DiaryRowInput = {
  id: string;
  created_at: string;
  food_id: string | null;
  portions: number;
  meal_section_id: string | null;
  quick_add_name: string | null;
  quick_add_calories: number | null;
  quick_add_protein: number | null;
  quick_add_carbs: number | null;
  quick_add_fat: number | null;
};

const diaryRefresh = (userId: string, date: string) => [
  { key: diaryKey(userId, date) },
  { key: ['daily-logs', userId] },
  { key: ['recent-foods', userId] },
];

export type DiaryAddVars = { userId: string; date: string; rows: DiaryRowInput[] };
export const WRITE_DIARY_ADD = defineWrite<DiaryAddVars>('diary-add', {
  run: async ({ userId, date, rows }) => {
    if (!rows.length) return;
    const dailyLogId = await logIdFor(userId, date);
    await insertOnce('food_diary_entries', rows.map((r) => ({ ...r, daily_log_id: dailyLogId })));
    await syncDiaryToLog(dailyLogId);
  },
  invalidate: ({ userId, date }) => diaryRefresh(userId, date),
});

export type DiaryRemoveVars = { userId: string; date: string; id: string };
export const WRITE_DIARY_REMOVE = defineWrite<DiaryRemoveVars>('diary-remove', {
  run: async ({ userId, date, id }) => {
    const { error } = await supabase.from('food_diary_entries').delete().eq('id', id);
    if (error) throw error;
    await syncDiaryToLog(await logIdFor(userId, date));
  },
  invalidate: ({ userId, date }) => diaryRefresh(userId, date),
});

export type DiaryPortionsVars = { userId: string; date: string; id: string; portions: number };
export const WRITE_DIARY_PORTIONS = defineWrite<DiaryPortionsVars>('diary-portions', {
  run: async ({ userId, date, id, portions }) => {
    const { error } = await supabase.from('food_diary_entries').update({ portions }).eq('id', id);
    if (error) throw error;
    await syncDiaryToLog(await logIdFor(userId, date));
  },
  invalidate: ({ userId, date }) => diaryRefresh(userId, date),
});

// Corrects a Quick Add after the fact (FS5): they could only be deleted and typed again. Only a row with no food behind it, so this can
// never turn a real food entry into a Quick Add.
export type DiaryQuickUpdateVars = {
  userId: string;
  date: string;
  id: string;
  fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null };
};
export const WRITE_DIARY_QUICK_UPDATE = defineWrite<DiaryQuickUpdateVars>('diary-quick-update', {
  run: async ({ userId, date, id, fields }) => {
    const { error } = await supabase
      .from('food_diary_entries')
      .update({ quick_add_name: fields.name, quick_add_calories: fields.calories, quick_add_protein: fields.protein, quick_add_carbs: fields.carbs, quick_add_fat: fields.fat })
      .eq('id', id)
      .is('food_id', null);
    if (error) throw error;
    await syncDiaryToLog(await logIdFor(userId, date));
  },
  invalidate: ({ userId, date }) => diaryRefresh(userId, date),
});

// "File under": moves an entry that is sitting in "Other" into one of the member's own sections.
export type DiaryRefileVars = { userId: string; date: string; id: string; sectionId: string };
export const WRITE_DIARY_REFILE = defineWrite<DiaryRefileVars>('diary-refile', {
  run: async ({ id, sectionId }) => {
    const { error } = await supabase.from('food_diary_entries').update({ meal_section_id: sectionId }).eq('id', id);
    if (error) throw error;
  },
  invalidate: ({ userId, date }) => [{ key: diaryKey(userId, date) }],
});

// ---------- manual macro entry ----------
// For members whose coach chose "type in your totals": protein, carbs and fat per meal, calories worked out from them. Like the food
// diary, the day's totals are written into that day's daily log after every change.

export async function syncManualToLog(dailyLogId: string) {
  const { data, error } = await supabase.from('manual_macro_entries').select('protein, carbs, fat').eq('daily_log_id', dailyLogId);
  if (error) throw error;
  // Calories here are always worked out from the macros (never typed), so the stored day total matches the totals bar exactly.
  const fields = dayFieldsFromManual((data ?? []).map((e) => ({ ...e, calories: null })));
  const { error: updateError } = await supabase.from('daily_logs').update(fields).eq('id', dailyLogId);
  if (updateError) throw updateError;
}

export type ManualRowInput = {
  id: string;
  created_at: string;
  meal_section_id: string | null;
  calories: number;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

const manualRefresh = (userId: string, date: string) => [{ key: manualKey(userId, date) }, { key: ['daily-logs', userId] }];

export type ManualAddVars = { userId: string; date: string; row: ManualRowInput };
export const WRITE_MANUAL_ADD = defineWrite<ManualAddVars>('manual-add', {
  run: async ({ userId, date, row }) => {
    const dailyLogId = await logIdFor(userId, date);
    await insertOnce('manual_macro_entries', [{ ...row, daily_log_id: dailyLogId }]);
    await syncManualToLog(dailyLogId);
  },
  invalidate: ({ userId, date }) => manualRefresh(userId, date),
});

export type ManualRemoveVars = { userId: string; date: string; id: string };
export const WRITE_MANUAL_REMOVE = defineWrite<ManualRemoveVars>('manual-remove', {
  run: async ({ userId, date, id }) => {
    const { error } = await supabase.from('manual_macro_entries').delete().eq('id', id);
    if (error) throw error;
    await syncManualToLog(await logIdFor(userId, date));
  },
  invalidate: ({ userId, date }) => manualRefresh(userId, date),
});

// ---------- sets logged in a workout ----------

const workoutRefresh = (userId: string, dayId: string) => [
  { key: workoutDayKey(userId, dayId) },
  { key: ['program-overview', userId] },
  { key: ['today-workout', userId] },
];

export type SetFields = { actual_reps: number | null; actual_load: number | null; actual_rpe: number | null };

// exercise_library_id is denormalised onto the log row so history survives a coach later restructuring the programme.
// logged_at is when the set was done (not when it reached the server): "logged today" and the history depend on it.
export type SetLogVars = {
  userId: string;
  dayId: string;
  row: SetFields & {
    id: string;
    logged_at: string;
    exercise_id: string;
    exercise_library_id: string | null;
    set_number: number;
    set_type: SetType;
  };
};
export const WRITE_SET_LOG = defineWrite<SetLogVars>('set-log', {
  run: async ({ userId, row }) => insertOnce('workout_logs', [{ ...row, client_id: userId }]),
  invalidate: ({ userId, dayId }) => workoutRefresh(userId, dayId),
});

export type SetUpdateVars = { userId: string; dayId: string; logId: string } & SetFields;
export const WRITE_SET_UPDATE = defineWrite<SetUpdateVars>('set-update', {
  run: async ({ logId, actual_reps, actual_load, actual_rpe }) => {
    const { error } = await supabase.from('workout_logs').update({ actual_reps, actual_load, actual_rpe }).eq('id', logId);
    if (error) throw error;
  },
  invalidate: ({ userId, dayId }) => workoutRefresh(userId, dayId),
});

export type SetDeleteVars = { userId: string; dayId: string; logId: string };
export const WRITE_SET_DELETE = defineWrite<SetDeleteVars>('set-delete', {
  run: async ({ logId }) => {
    const { error } = await supabase.from('workout_logs').delete().eq('id', logId);
    if (error) throw error;
  },
  invalidate: ({ userId, dayId }) => workoutRefresh(userId, dayId),
});

// Picks (or changes) what the member did in slot 1 or 2. One long conditioning block covers both slots, so choosing
// it clears any slot 2 pick.
export type BlockChoiceVars = { userId: string; dayId: string; slot: 1 | 2; blockKey: string; chosenAt: string };
export const WRITE_BLOCK_CHOICE = defineWrite<BlockChoiceVars>('block-choice', {
  run: async ({ userId, dayId, slot, blockKey, chosenAt }) => {
    const { error } = await supabase
      .from('workout_block_choices')
      .upsert({ client_id: userId, program_day_id: dayId, slot, block_key: blockKey, chosen_at: chosenAt }, { onConflict: 'client_id,program_day_id,slot' });
    if (error) throw error;
    if (slot === 1 && blockKey === 'conditioning:0') {
      const { error: clearError } = await supabase.from('workout_block_choices').delete().eq('client_id', userId).eq('program_day_id', dayId).eq('slot', 2);
      if (clearError) throw clearError;
    }
  },
  invalidate: ({ userId, dayId }) => [{ key: workoutDayKey(userId, dayId) }, { key: ['program-overview', userId] }],
});

// "Rate this session": one row per member and day (upsert).
export type SessionFeedbackVars = { userId: string; dayId: string; sessionRpe: number | null; notes: string | null };
export const WRITE_SESSION_FEEDBACK = defineWrite<SessionFeedbackVars>('session-feedback', {
  run: async ({ userId, dayId, sessionRpe, notes }) => {
    const { error } = await supabase
      .from('workout_day_feedback')
      .upsert({ client_id: userId, program_day_id: dayId, session_rpe: sessionRpe, notes }, { onConflict: 'client_id,program_day_id' });
    if (error) throw error;
  },
  invalidate: ({ userId, dayId }) => [{ key: workoutDayKey(userId, dayId) }],
});

// ---------- the daily check-in ----------

// Saves what the member just changed on one day, and ONLY that: the upsert carries the changed fields, so another figure
// (or the macros the food diary wrote) is never overwritten by an older copy.
export type DaySaveVars = { userId: string; date: string; patch: DayPatch };
export const WRITE_DAY_SAVE = defineWrite<DaySaveVars>('day-save', {
  run: async ({ userId, date, patch }) => {
    const problem = validateDayPatch(patch);
    if (problem) throw new Error(problem);
    const { error } = await supabase.from('daily_logs').upsert({ client_id: userId, log_date: date, ...patch }, { onConflict: 'client_id,log_date' });
    if (error) throw error;
  },
  // The cached copies already show the change, so they are only marked stale (no refetch) unless the save was refused.
  invalidate: ({ userId, patch }) => [
    { key: ['daily-logs', userId], refetch: false },
    ...('period_started' in patch ? [{ key: ['daily-logs', userId, 'period-starts'] }] : []),
  ],
});
