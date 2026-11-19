'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { syncFoodDiaryToLog } from './foodDiary';
import { fail } from './result';
import { newPlanRows } from '@/lib/planLogging';
import { plannedFor, type PlanPick } from '@/lib/utils/planSections';
import type { MealPlanEntryRow } from './types';

// The Meal Planner is laid out in the member's own diary sections (NU12): a planned item belongs to one of them (meal_section_id), and
// one planned before that is filed by its old fixed meal (lib/utils/planSections.ts).

export async function getMealPlanEntries(clientId: string): Promise<MealPlanEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_plan_entries')
    .select('*, food:foods(*)')
    .eq('client_id', clientId);
  if (error) raise(error);
  return (data ?? []) as unknown as MealPlanEntryRow[];
}

// The section must be one of this member's own (null = "Other").
async function checkOwnSection(clientId: string, mealSectionId: string | null): Promise<void> {
  if (mealSectionId === null) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from('meal_sections').select('id').eq('client_id', clientId).eq('id', mealSectionId).maybeSingle();
  if (error) raise(error);
  if (!data) throw new Error('That meal is not one of your sections.');
}

export async function addMealPlanEntry(
  clientId: string,
  mealSectionId: string | null,
  foodId: string,
  portions: number
): Promise<void> {
  await checkOwnSection(clientId, mealSectionId);
  const supabase = await createClient();
  const { error } = await supabase
    .from('meal_plan_entries')
    .insert({ client_id: clientId, meal_section_id: mealSectionId, section: null, food_id: foodId, portions });
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

// Copies planned foods (one meal, the "Other" ones, or the whole plan) into today's food diary, each into the same section it is planned
// in, and refreshes the day's totals. What is already in the diary (the same food, section and amount) is skipped, so tapping it twice
// no longer doubles every entry (MP1); `added` says how many were new.
export async function logPlanToDiary(
  clientId: string,
  dailyLogId: string,
  which: PlanPick
): Promise<{ ok: true; added: number; planned: number } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data: plan, error } = await supabase
    .from('meal_plan_entries')
    .select('section, meal_section_id, food_id, portions')
    .eq('client_id', clientId);
  if (error) return fail(error, 'Could not read your plan') as { ok: false; error: string };
  const { data: sections, error: sectionsError } = await supabase
    .from('meal_sections')
    .select('id, label, sort_order, created_at')
    .eq('client_id', clientId);
  if (sectionsError) return fail(sectionsError, 'Could not read your meals') as { ok: false; error: string };

  const rows = plannedFor((plan ?? []).filter((p) => p.food_id), which, sections ?? []).map(({ entry, sectionId }) => ({
    daily_log_id: dailyLogId,
    food_id: entry.food_id as string,
    portions: entry.portions as number,
    meal_section_id: sectionId,
  }));
  if (rows.length === 0) return fail(null, 'Nothing planned to add') as { ok: false; error: string };

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
