'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { getDailyLog, getOrCreateDailyLog } from './dailyLogs';
import type { FoodDiaryEntryRow } from './types';

// Resolves a given date's diary, for the date-nav in FoodTrackingTab (Phase 3: past-day
// editing for clients, past-day viewing for coaches). `create: true` (client) backfills a
// blank daily_logs row so a client can start logging a day that has no row yet -- same as
// dashboardBundle already does for "today". `create: false` (coach) never creates one: a
// coach viewing a day the client never opened should see "nothing logged", not silently
// materialize a row.
export async function getFoodDiaryForDate(
  clientId: string,
  date: string,
  create: boolean
): Promise<{ dailyLogId: string | null; entries: FoodDiaryEntryRow[] }> {
  const dailyLog = create ? await getOrCreateDailyLog(clientId, date) : await getDailyLog(clientId, date);
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
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('food_diary_entries')
    .insert({ daily_log_id: dailyLogId, food_id: foodId, portions, meal_section_id: mealSectionId });
  if (error) raise(error);
  await syncFoodDiaryToLog(dailyLogId);
}

export async function removeFoodDiaryEntry(id: string, dailyLogId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').delete().eq('id', id);
  if (error) raise(error);
  await syncFoodDiaryToLog(dailyLogId);
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
export async function updateFoodDiaryEntryPortions(entryId: string, portions: number, dailyLogId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').update({ portions }).eq('id', entryId);
  if (error) raise(error);
  await syncFoodDiaryToLog(dailyLogId);
}

// Writes the food diary's running totals into today's Weekly Log row, so downstream
// Totals/Averages and floor-checks reflect what was actually logged (PROJECT_SPEC.md #5).
export async function syncFoodDiaryToLog(dailyLogId: string): Promise<void> {
  const entries = await getFoodDiaryEntries(dailyLogId);
  const totals = entries.reduce(
    (acc, entry) => {
      if (!entry.food) return acc;
      acc.protein += entry.food.protein * entry.portions;
      acc.carbs += entry.food.carbs * entry.portions;
      acc.fat += entry.food.fat * entry.portions;
      return acc;
    },
    { protein: 0, carbs: 0, fat: 0 }
  );

  const supabase = await createClient();
  const { error } = await supabase
    .from('daily_logs')
    .update({
      protein: Math.round(totals.protein * 10) / 10,
      carbs: Math.round(totals.carbs * 10) / 10,
      fat: Math.round(totals.fat * 10) / 10,
    })
    .eq('id', dailyLogId);
  if (error) raise(error);
}
