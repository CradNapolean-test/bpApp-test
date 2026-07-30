'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ActivityRow, FoodRow } from './types';

export async function searchFoods(query: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  let request = supabase.from('foods').select('*').order('name').limit(25);
  if (query.trim()) {
    request = request.ilike('name', `%${query.trim()}%`);
  }
  const { data, error } = await request;
  if (error) raise(error);
  return data ?? [];
}

export async function getFoodByBarcode(barcode: string): Promise<FoodRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .eq('barcode', barcode)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

// Caches a barcode-scanned product into the shared foods table. Never overwrites an
// existing row for that barcode (ON CONFLICT DO NOTHING) — if a lookup lands on a barcode
// someone already cached (or that was in the original seed data), we just hand back what's
// already there rather than risk clobbering curated macros with a lower-quality OFF entry.
export async function upsertFoodFromBarcode(
  barcode: string,
  fields: { name: string; portion: string; protein: number; carbs: number; fat: number }
): Promise<FoodRow> {
  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from('foods')
    .insert({ barcode, ...fields })
    .select()
    .maybeSingle();
  // Conflict on the unique barcode column is expected/harmless when another session (or a
  // prior scan) already cached this barcode — fall through to the select below either way.
  if (insertError && insertError.code !== '23505') raise(insertError);

  const existing = await getFoodByBarcode(barcode);
  if (!existing) throw new Error('Failed to cache scanned food');
  return existing;
}

export async function getActivities(): Promise<ActivityRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('activities').select('*').order('name');
  if (error) raise(error);
  return data ?? [];
}
