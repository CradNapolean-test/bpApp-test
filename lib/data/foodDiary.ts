'use server';

import { raise } from './errors';
import { fail } from './result';
import { createClient } from '@/lib/supabase/server';
import { getDailyLog, getOrCreateDailyLog } from './dailyLogs';
import { canBrowseDate, canEditFoodDay } from '@/lib/dayPatch';
import { rowsToCopy } from '@/lib/diaryCopy';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
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

export type DiaryCopyResult =
  | { ok: true; found: number; added: number; dailyLogId: string; entries: FoodDiaryEntryRow[] }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// Copies a day's food, or one meal of it, onto another day -- the Food screen's "Copy day", each meal's copy button and "Copy yesterday's
// food". Food and Quick Add rows both carry over (amounts and figures as they were). Each row keeps its meal unless `toSectionId` files
// them all into one (Lunch to Dinner). What the target day already has (the same row in the same meal) is skipped, so a second tap or
// a day copied twice adds nothing; `added` of `found` says how many were new. Nothing to copy is an error with a message, not an empty
// success, and the target day's row is only made once there is something to put on it (FT1). Returns the target day's entries so the
// screen can show them without another trip (FT3).
//
// A member changes tomorrow, today and the last 14 days and looks back 30 (dayPatch.ts), but that rule only lived in the screens; it is checked
// here too so a copy cannot reach a day the screen would have locked.
export async function copyDiaryBetweenDates(
  clientId: string,
  fromDate: string,
  toDate: string,
  options: { fromSectionId?: string; toSectionId?: string } = {}
): Promise<DiaryCopyResult> {
  const { fromSectionId, toSectionId } = options;
  if (!ISO_DATE.test(fromDate) || !ISO_DATE.test(toDate)) return fail(null, 'Pick a day to copy.') as DiaryCopyResult;
  if (fromDate === toDate && (toSectionId === undefined || toSectionId === fromSectionId)) {
    return fail(null, 'That is already there. Pick a different day or meal.') as DiaryCopyResult;
  }

  const supabase = await createClient();
  const { data: tzRow } = await supabase.from('client_profiles').select('timezone').eq('client_id', clientId).maybeSingle();
  const todayIso = todayIsoInTz(tzRow?.timezone ?? DEFAULT_TIMEZONE);
  if (!canEditFoodDay(toDate, todayIso)) return fail(null, 'Food can only be copied into tomorrow, today or the last 2 weeks.') as DiaryCopyResult;
  if (!canBrowseDate(fromDate, todayIso)) return fail(null, 'That day is too far back to copy from.') as DiaryCopyResult;

  // Both meals have to be this member's own.
  const sectionIds = [...new Set([fromSectionId, toSectionId].filter((id): id is string => id !== undefined))];
  if (sectionIds.length > 0) {
    const { data: owned, error: ownedError } = await supabase.from('meal_sections').select('id').eq('client_id', clientId).in('id', sectionIds);
    if (ownedError) raise(ownedError);
    if ((owned ?? []).length !== sectionIds.length) return fail(null, 'That meal is not one of your sections.') as DiaryCopyResult;
  }

  const nothing = fromSectionId ? 'Nothing is logged in that meal on that day.' : 'Nothing is logged on that day to copy.';
  const fromLog = await getDailyLog(clientId, fromDate);
  if (!fromLog) return fail(null, nothing) as DiaryCopyResult;
  let request = supabase.from('food_diary_entries').select('*').eq('daily_log_id', fromLog.id).order('created_at');
  if (fromSectionId) request = request.eq('meal_section_id', fromSectionId);
  const { data: source, error: sourceError } = await request;
  if (sourceError) raise(sourceError);
  if (!source || source.length === 0) return fail(null, nothing) as DiaryCopyResult;

  const toLog = (await getDailyLog(clientId, toDate)) ?? (await getOrCreateDailyLog(clientId, toDate));
  const { data: existing, error: existingError } = await supabase
    .from('food_diary_entries')
    .select('food_id, portions, meal_section_id, quick_add_name, quick_add_calories, quick_add_protein, quick_add_carbs, quick_add_fat')
    .eq('daily_log_id', toLog.id);
  if (existingError) raise(existingError);

  const fresh = rowsToCopy(source, existing ?? [], toSectionId);
  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from('food_diary_entries').insert(
      fresh.map((entry) => ({
        daily_log_id: toLog.id,
        food_id: entry.food_id,
        portions: entry.portions,
        meal_section_id: entry.meal_section_id,
        quick_add_name: entry.quick_add_name,
        quick_add_calories: entry.quick_add_calories,
        quick_add_protein: entry.quick_add_protein,
        quick_add_carbs: entry.quick_add_carbs,
        quick_add_fat: entry.quick_add_fat,
      }))
    );
    if (insertError) raise(insertError);
  }
  const entries = fresh.length > 0 ? await syncFoodDiaryToLog(toLog.id) : await getFoodDiaryEntries(toLog.id);
  return { ok: true, found: source.length, added: fresh.length, dailyLogId: toLog.id, entries };
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
