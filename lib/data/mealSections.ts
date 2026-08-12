'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { MealSectionRow } from './types';

const DEFAULT_SECTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

export async function getMealSections(clientId: string): Promise<MealSectionRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_sections')
    .select('*')
    .eq('client_id', clientId)
    .order('sort_order');
  if (error) raise(error);
  return data ?? [];
}

// Seeds the 4 defaults on first use -- mirrors getOrCreateDailyLog's idiom. Only called when
// canWrite (see dashboardBundle.ts), so a coach's mere page-view of a client never seeds rows
// as a side effect.
export async function getOrCreateMealSections(clientId: string): Promise<MealSectionRow[]> {
  const existing = await getMealSections(clientId);
  if (existing.length > 0) return existing;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('meal_sections')
    .insert(DEFAULT_SECTIONS.map((label, index) => ({ client_id: clientId, label, sort_order: index })))
    .select('*');
  if (error) raise(error);
  return (data ?? []).sort((a, b) => a.sort_order - b.sort_order);
}

export async function createMealSection(clientId: string, label: string): Promise<void> {
  const supabase = await createClient();
  const { data: existing, error: existingError } = await supabase
    .from('meal_sections')
    .select('sort_order')
    .eq('client_id', clientId)
    .order('sort_order', { ascending: false })
    .limit(1);
  if (existingError) raise(existingError);
  const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1;

  const { error } = await supabase.from('meal_sections').insert({ client_id: clientId, label, sort_order: nextOrder });
  if (error) raise(error);
}

export async function renameMealSection(id: string, label: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('meal_sections').update({ label }).eq('id', id);
  if (error) raise(error);
}

// Same shape as workouts.ts's reorderExercises -- one update per row, no RPC needed for a
// small per-client list.
export async function reorderMealSections(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('meal_sections').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function deleteMealSection(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('meal_sections').delete().eq('id', id);
  if (error) raise(error);
}
