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

export async function getFavoriteFoods(clientId: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_favorites')
    .select('created_at, food:foods(*)')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false });
  if (error) raise(error);
  return ((data ?? []) as unknown as { food: FoodRow }[]).map((r) => r.food).filter(Boolean);
}

export async function isFavoriteFood(clientId: string, foodId: string): Promise<boolean> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_favorites')
    .select('food_id')
    .eq('client_id', clientId)
    .eq('food_id', foodId)
    .maybeSingle();
  if (error) raise(error);
  return data != null;
}

export async function setFavoriteFood(clientId: string, foodId: string, isFavorite: boolean): Promise<void> {
  const supabase = await createClient();
  if (isFavorite) {
    const { error } = await supabase.from('food_favorites').upsert({ client_id: clientId, food_id: foodId });
    if (error) raise(error);
  } else {
    const { error } = await supabase
      .from('food_favorites')
      .delete()
      .eq('client_id', clientId)
      .eq('food_id', foodId);
    if (error) raise(error);
  }
}

const RECENTLY_LOGGED_LIMIT = 8;

// Derived, not maintained -- the last 50 logged (food-matched, not quick-add) diary rows for
// this client, deduped to unique foods keeping the most recent occurrence, capped at 8. RLS on
// food_diary_entries already scopes rows to the caller's own via daily_logs.client_id, so the
// explicit clientId filter here is defense-in-depth/clarity, not the actual security boundary.
export async function getRecentlyLoggedFoods(clientId: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_diary_entries')
    .select('food_id, created_at, food:foods(*), daily_logs!inner(client_id)')
    .eq('daily_logs.client_id', clientId)
    .not('food_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) raise(error);

  const seen = new Set<string>();
  const recent: FoodRow[] = [];
  for (const row of (data ?? []) as unknown as { food_id: string; food: FoodRow | null }[]) {
    if (!row.food || seen.has(row.food_id)) continue;
    seen.add(row.food_id);
    recent.push(row.food);
    if (recent.length >= RECENTLY_LOGGED_LIMIT) break;
  }
  return recent;
}
