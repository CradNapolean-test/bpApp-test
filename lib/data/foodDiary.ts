'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { getDailyLog, getOrCreateDailyLog } from './dailyLogs';
import { dayFieldsFromDiary } from '@/lib/utils/foodTotals';
import type { FoodDiaryEntryRow } from './types';

// Resolves a given date's diary, for the date-nav in FoodTrackingTab. It only READS: browsing back day by day used to create a blank
// daily_logs row for every day looked at (FT1). A day with no row comes back with dailyLogId null, and the row is created the moment
// the first food is added to it (the screen calls getOrCreateDailyLog then).
export async function getFoodDiaryForDate(
  clientId: string,
  date: string
): Promise<{ dailyLogId: string | null; entries: FoodDiaryEntryRow[] }> {
  const dailyLog = await getDailyLog(clientId, date);
  if (!dailyLog) return { dailyLogId: null, entries: [] };
  const entries = await getFoodDiaryEntries(dailyLog.id);
  return { dailyLogId: dailyLog.id, entries };
}

export async function getFoodDiaryEntries(dailyLogId: string): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_diary_entries')
    .select('*, food:foods(*)')
    .eq('daily_log_id', dailyLogId);
  if (error) raise(error);
  return (data ?? []) as unknown as FoodDiaryEntryRow[];
}

export async function addFoodDiaryEntry(
  dailyLogId: string,
  foodId: string,
  portions: number,
  mealSectionId: string | null = null
): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('food_diary_entries')
    .insert({ daily_log_id: dailyLogId, food_id: foodId, portions, meal_section_id: mealSectionId });
  if (error) raise(error);
  return syncFoodDiaryToLog(dailyLogId);
}

// Quick Add -- a diary row with no food_id, for something with no food-database match (a
// restaurant meal, an estimate). Same row shape/section filing as a normal entry, just
// carrying inline quick_add_* macros instead of a resolved food (migration 0049).
export async function addQuickAddEntry(
  dailyLogId: string,
  mealSectionId: string | null,
  fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').insert({
    daily_log_id: dailyLogId,
    food_id: null,
    portions: 1,
    meal_section_id: mealSectionId,
    quick_add_name: fields.name,
    quick_add_calories: fields.calories,
    quick_add_protein: fields.protein,
    quick_add_carbs: fields.carbs,
    quick_add_fat: fields.fat,
  });
  if (error) raise(error);
  return syncFoodDiaryToLog(dailyLogId);
}

// Corrects a Quick Add after the fact (FS5): they could only be deleted and typed again. Only a row with no food behind it, so this
// can never turn a real food entry into a Quick Add.
export async function updateQuickAddEntry(
  entryId: string,
  dailyLogId: string,
  fields: { name: string; calories: number | null; protein: number | null; carbs: number | null; fat: number | null }
): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('food_diary_entries')
    .update({
      quick_add_name: fields.name,
      quick_add_calories: fields.calories,
      quick_add_protein: fields.protein,
      quick_add_carbs: fields.carbs,
      quick_add_fat: fields.fat,
    })
    .eq('id', entryId)
    .is('food_id', null);
  if (error) raise(error);
  return syncFoodDiaryToLog(dailyLogId);
}

export async function removeFoodDiaryEntry(id: string, dailyLogId: string): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').delete().eq('id', id);
  if (error) raise(error);
  return syncFoodDiaryToLog(dailyLogId);
}

// Re-files an entry into a different (or no) section -- covers legacy pre-migration rows
// (meal_section_id starts null) and simple corrections.
export async function updateFoodDiaryEntrySection(entryId: string, mealSectionId: string | null): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('food_diary_entries')
    .update({ meal_section_id: mealSectionId })
    .eq('id', entryId);
  if (error) raise(error);
}

// Corrects a logged quantity after the fact (e.g. misjudged a portion) instead of forcing a
// delete-and-re-add -- tapping a diary row opens this.
export async function updateFoodDiaryEntryPortions(entryId: string, portions: number, dailyLogId: string): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').update({ portions }).eq('id', entryId);
  if (error) raise(error);
  return syncFoodDiaryToLog(dailyLogId);
}

// "Copy from yesterday" entry point -- resolves both days by date (client_id + a date string) rather than making FoodTrackingTab do its
// own date math. Returns count 0 (not an error) if the source day has nothing to copy -- "yesterday" being blank is an expected, common
// case -- and then creates nothing: the target day's row is only made once there is something to put on it (FT1). Returns the target
// day's entries so the screen can show them without another trip (FT3).
export async function copyFromDate(
  clientId: string,
  fromDate: string,
  toDate: string
): Promise<{ count: number; dailyLogId: string | null; entries: FoodDiaryEntryRow[] }> {
  const fromDailyLog = await getDailyLog(clientId, fromDate);
  if (!fromDailyLog) return { count: 0, dailyLogId: null, entries: [] };
  const target = await getDailyLog(clientId, toDate);
  const sourceEntries = await getFoodDiaryEntries(fromDailyLog.id);
  if (sourceEntries.length === 0) return { count: 0, dailyLogId: target?.id ?? null, entries: [] };
  const toLog = target ?? (await getOrCreateDailyLog(clientId, toDate));
  const count = await copyDiaryEntries(fromDailyLog.id, toLog.id);
  return { count, dailyLogId: toLog.id, entries: await getFoodDiaryEntries(toLog.id) };
}

// Copies a source day's entries (optionally scoped to one section) into a target day --
// "Copy from yesterday" and, later, a per-section "copy this meal" affordance. Copies both
// food-matched and Quick Add rows (portions/quick_add_* carry over as-is); meal_section_id
// carries over too, so a copy lands in the same section it came from on the target day.
export async function copyDiaryEntries(
  fromDailyLogId: string,
  toDailyLogId: string,
  mealSectionId?: string | null
): Promise<number> {
  const supabase = await createClient();
  let request = supabase.from('food_diary_entries').select('*').eq('daily_log_id', fromDailyLogId);
  if (mealSectionId !== undefined) request = request.eq('meal_section_id', mealSectionId);
  const { data: source, error: fetchError } = await request;
  if (fetchError) raise(fetchError);
  if (!source || source.length === 0) return 0;

  const copies = source.map((entry) => ({
    daily_log_id: toDailyLogId,
    food_id: entry.food_id,
    portions: entry.portions,
    meal_section_id: entry.meal_section_id,
    quick_add_name: entry.quick_add_name,
    quick_add_calories: entry.quick_add_calories,
    quick_add_protein: entry.quick_add_protein,
    quick_add_carbs: entry.quick_add_carbs,
    quick_add_fat: entry.quick_add_fat,
  }));

  const { error: insertError } = await supabase.from('food_diary_entries').insert(copies);
  if (insertError) raise(insertError);
  await syncFoodDiaryToLog(toDailyLogId);
  return copies.length;
}

// Writes the food diary's running totals into the day's Weekly Log row, so downstream Totals/Averages and floor-checks reflect what was
// actually logged (PROJECT_SPEC.md #5). The day's calories are stored too, INCLUDING Quick Adds with no macros (R11, migration 0136), and a
// day with no entries at all is written as nulls, not zeros (M2). Returns the day's entries, which it has just read, so the screen can
// show the result without another round trip (FT3).
export async function syncFoodDiaryToLog(dailyLogId: string): Promise<FoodDiaryEntryRow[]> {
  const entries = await getFoodDiaryEntries(dailyLogId);
  const fields = dayFieldsFromDiary(entries);

  const supabase = await createClient();
  const { error } = await supabase.from('daily_logs').update(fields).eq('id', dailyLogId);
  if (error) raise(error);
  return entries;
}
