'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { syncFoodDiaryToLog } from './foodDiary';
import { ok, fail } from './result';
import type { ActionResult } from './result';
import type { MealPlanEntryRow, MealPlanSection } from './types';

// Which of the member's diary sections a planned meal goes into (matched by name; if they've
// renamed or removed it, it goes in unfiled).
const DIARY_LABEL: Record<MealPlanSection, string> = {
  breakfast: 'Breakfast',
  mid_morning_snack: 'Snacks',
  lunch: 'Lunch',
  afternoon_snack: 'Snacks',
  dinner: 'Dinner',
  evening_snack: 'Snacks',
};

export async function getMealPlanEntries(clientId: string): Promise<MealPlanEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('*, food:foods(*)')
    .eq('client_id', clientId);
  if (error) raise(error);
  return (data ?? []) as unknown as MealPlanEntryRow[];
}

export async function addMealPlanEntry(
  clientId: string,
  section: MealPlanSection,
  foodId: string,
  portions: number
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_entries')
    .insert({ client_id: clientId, section, food_id: foodId, portions });
  if (error) raise(error);
}

export async function updateMealPlanEntryPortions(id: string, portions: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('meal_plan_entries').update({ portions }).eq('id', id);
  if (error) raise(error);
}

export async function removeMealPlanEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
  if (error) raise(error);
}

// Copies planned foods (one meal, or the whole plan) into today's food diary, filed under the
// matching diary section, and refreshes the day's totals.
export async function logPlanToDiary(
  clientId: string,
  dailyLogId: string,
  which: MealPlanSection | 'all'
): Promise<ActionResult> {
  const supabase = await createClient();
  let planQuery = supabase.from('meal_plan_entries').select('section, food_id, portions').eq('client_id', clientId);
  if (which !== 'all') planQuery = planQuery.eq('section', which);
  const { data: plan, error } = await planQuery;
  if (error) return fail(error, 'Could not read your plan');
  const planned = (plan ?? []).filter((p) => p.food_id);
  if (planned.length === 0) return fail(null, 'Nothing planned to add');

  const { data: sections } = await supabase.from('meal_sections').select('id, label').eq('client_id', clientId);
  const sectionFor = (key: MealPlanSection) =>
    (sections ?? []).find((s) => s.label.trim().toLowerCase() === DIARY_LABEL[key].toLowerCase())?.id ?? null;

  const rows = planned.map((p) => ({
    daily_log_id: dailyLogId,
    food_id: p.food_id,
    portions: p.portions,
    meal_section_id: sectionFor(p.section as MealPlanSection),
  }));
  const { error: insertError } = await supabase.from('food_diary_entries').insert(rows);
  if (insertError) return fail(insertError, "Could not add to today's diary");
  await syncFoodDiaryToLog(dailyLogId);
  return ok();
}
