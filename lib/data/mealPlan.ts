'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { syncFoodDiaryToLog } from './foodDiary';
import { fail } from './result';
import { newPlanRows } from '@/lib/planLogging';
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
// matching diary section, and refreshes the day's totals. What is already in the diary (the same food, section and amount) is skipped, so
// tapping it twice no longer doubles every entry (MP1); `added` says how many were new.
export async function logPlanToDiary(
  clientId: string,
  dailyLogId: string,
  which: MealPlanSection | 'all'
): Promise<{ ok: true; added: number; planned: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  let planQuery = supabase.from('meal_plan_entries').select('section, food_id, portions').eq('client_id', clientId);
  if (which !== 'all') planQuery = planQuery.eq('section', which);
  const { data: plan, error } = await planQuery;
  if (error) return fail(error, 'Could not read your plan') as { ok: false; error: string };
  const planned = (plan ?? []).filter((p) => p.food_id);
  if (planned.length === 0) return fail(null, 'Nothing planned to add') as { ok: false; error: string };

  const { data: sections } = await supabase.from('meal_sections').select('id, label').eq('client_id', clientId);
  const sectionFor = (key: MealPlanSection) =>
    (sections ?? []).find((s) => s.label.trim().toLowerCase() === DIARY_LABEL[key].toLowerCase())?.id ?? null;

  const rows = planned.map((p) => ({
    daily_log_id: dailyLogId,
    food_id: p.food_id,
    portions: p.portions,
    meal_section_id: sectionFor(p.section as MealPlanSection),
  }));
  const { data: already, error: alreadyError } = await supabase
    .from('food_diary_entries')
    .select('food_id, portions, meal_section_id')
    .eq('daily_log_id', dailyLogId);
  if (alreadyError) return fail(alreadyError, "Could not read today's diary") as { ok: false; error: string };
  const fresh = newPlanRows(rows, already ?? []);
  if (fresh.length > 0) {
    const { error: insertError } = await supabase.from('food_diary_entries').insert(fresh);
    if (insertError) return fail(insertError, "Could not add to today's diary") as { ok: false; error: string };
    await syncFoodDiaryToLog(dailyLogId);
  }
  return { ok: true, added: fresh.length, planned: rows.length };
}
