'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { MealPlanEntryRow, MealPlanSection } from './types';

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

export async function removeMealPlanEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
  if (error) raise(error);
}
