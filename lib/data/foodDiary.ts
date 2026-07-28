'use server';

import { createClient } from '@/lib/supabase/server';
import type { FoodDiaryEntryRow } from './types';

export async function getFoodDiaryEntries(dailyLogId: string): Promise<FoodDiaryEntryRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_diary_entries')
    .select('*, food:foods(*)')
    .eq('daily_log_id', dailyLogId);
  if (error) throw error;
  return (data ?? []) as unknown as FoodDiaryEntryRow[];
}

export async function addFoodDiaryEntry(
  dailyLogId: string,
  foodId: string,
  portions: number
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('food_diary_entries')
    .insert({ daily_log_id: dailyLogId, food_id: foodId, portions });
  if (error) throw error;
}

export async function removeFoodDiaryEntry(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('food_diary_entries').delete().eq('id', id);
  if (error) throw error;
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
  if (error) throw error;
}
