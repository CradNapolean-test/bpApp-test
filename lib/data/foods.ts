'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { PairHistoryRow } from '@/lib/foodPairs';
import { addDays, toIsoDate } from '@/lib/utils/dates';
import type { ServingOption } from '@/lib/utils/foodUnits';
import type { ActivityRow, FoodRow } from './types';

export async function searchFoods(query: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  const q = query.trim();
  if (q) {
    // Ranked multi-word search over the whole UK database (migration 0074): exact and starts-with
    // matches first, then UK generics, scanned/imported products, and the old seed last.
    const ranked = await supabase.rpc('search_foods', { p_query: q, p_limit: 25 });
    if (!ranked.error) return (ranked.data ?? []) as FoodRow[];
    // Not applied yet (or any other failure): fall back to the plain name search below.
  }
  // Hidden foods stay out of the fallback too (M12), as they do in search_foods.
  let request = supabase.from('foods').select('*').eq('hidden', false).order('name').limit(25);
  if (q) request = request.ilike('name', `%${q}%`);
  const { data, error } = await request;
  if (error) raise(error);
  return data ?? [];
}

// The same product can be written several ways: a phone scan of a UPC-A gives 12 digits, an EAN-13
// gives 13 (often with leading zeros), an EAN-8 gives 8, and Open Food Facts pads some codes with
// zeros. Compare on the digits only, trying the usual padded lengths, so a scan matches however the
// food was stored.
export async function barcodeVariants(barcode: string): Promise<string[]> {
  const digits = barcode.replace(/\D/g, '');
  const stripped = digits.replace(/^0+/, '') || digits;
  const variants = new Set<string>([barcode, digits, stripped]);
  for (const len of [8, 12, 13, 14]) {
    if (stripped.length <= len) variants.add(stripped.padStart(len, '0'));
  }
  return [...variants];
}

// Rows a coach has hidden are not found by a scan (M12). A hidden row still holds its unique barcode, so the caller that tries to cache
// the product again has to tell "nothing here" from "hidden" -- see upsertFoodFromBarcode.
async function findByBarcode(barcode: string): Promise<FoodRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('foods')
    .select('*')
    .in('barcode', await barcodeVariants(barcode))
    .order('hidden')
    .limit(1);
  if (error) raise(error);
  return data?.[0] ?? null;
}

export async function getFoodByBarcode(barcode: string): Promise<FoodRow | null> {
  const found = await findByBarcode(barcode);
  return found && !found.hidden ? found : null;
}

// Caches a barcode-scanned product into the shared foods table. Never overwrites an
// existing row for that barcode (ON CONFLICT DO NOTHING) — if a lookup lands on a barcode
// someone already cached (or that was in the original seed data), we just hand back what's
// already there rather than risk clobbering curated macros with a lower-quality OFF entry.
export async function upsertFoodFromBarcode(
  barcode: string,
  fields: { name: string; portion: string; protein: number; carbs: number; fat: number; fibre?: number | null; serving_options?: ServingOption[] | null }
): Promise<FoodRow> {
  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from('foods')
    // The insert policy (0106) allows names of 1-200 characters; Open Food Facts names can be longer.
    .insert({ barcode, source: 'scan', ...fields, name: fields.name.trim().slice(0, 200) })
    .select()
    .maybeSingle();
  // Conflict on the unique barcode column is expected/harmless when another session (or a
  // prior scan) already cached this barcode — fall through to the select below either way.
  if (insertError && insertError.code !== '23505') raise(insertError);

  const existing = await findByBarcode(barcode);
  if (!existing) throw new Error('Failed to cache scanned food');
  // The product was scanned before and a coach hid it (it was wrong). Say so, rather than adding it again or failing without a reason.
  if (existing.hidden) throw new Error('This product has been taken off the food list. Add it with Quick Add instead, or ask your coach.');
  return existing;
}

// Sets what a food's servings are ("1 biscuit = 15 g"), or clears them with null. A coach can do this on any food; a member can only fill
// them in on a scanned food that has none yet (the database decides, migration 0148), which is how a product scanned before servings
// existed picks up the pack's serving. A refusal comes back as a message.
export async function setFoodServings(foodId: string, options: ServingOption[] | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('set_food_servings', { p_food_id: foodId, p_options: options });
  if (error) return fail(error, 'Could not save those servings.');
  if (data !== true) return fail({ message: 'Only a coach can change the servings on this food.' });
  return ok();
}

// The coach's search across the whole food list (not just scanned products), hidden ones excluded, for setting servings.
export async function searchAllFoodsForCoach(query: string): Promise<FoodRow[]> {
  return searchFoods(query);
}

// The coach's list of foods that members added by scanning a barcode (M12), by name, hidden ones included so they can be brought back.
// Looks at the name, brand and barcode. Reading is open to any signed-in user; changing a row is the coach-only rule in migration 0128.
export async function searchScannedFoods(query: string): Promise<FoodRow[]> {
  const supabase = await createClient();
  const q = query.trim().replace(/[%,()]/g, ' ').trim();
  let request = supabase.from('foods').select('*').eq('source', 'scan').order('name').limit(40);
  if (q) request = request.or(`name.ilike.%${q}%,barcode.ilike.%${q}%`);
  const { data, error } = await request;
  if (error) raise(error);
  return (data ?? []) as FoodRow[];
}

// Hides a wrong scanned food from every member's search, favourites and scans, or brings it back. Deleting is not offered: a food that
// has been logged cannot be deleted. A row that cannot be changed (not a scanned food, or not a coach) updates nothing, so say so.
export async function setFoodHidden(foodId: string, hidden: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('foods').update({ hidden }).eq('id', foodId).eq('source', 'scan').select('id');
  if (error) return fail(error, 'Could not change that food.');
  if (!data || data.length === 0) return fail({ message: 'Only scanned foods can be hidden, and only by a coach.' });
  return ok();
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
  return ((data ?? []) as unknown as { food: FoodRow | null }[]).map((r) => r.food).filter((f): f is FoodRow => f != null && !f.hidden);
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

const PAIR_HISTORY_DAYS = 60;
const PAIR_HISTORY_ROWS = 1000;

// The food rows of this member's last 60 days of diary, for working out which foods they usually eat together (lib/foodPairs.ts does the
// working out). Food rows only: a Quick Add has no food to suggest. Like getRecentlyLoggedFoods, RLS keeps it to their own rows and the
// clientId filter is clarity, not the security boundary.
export async function getFoodPairHistory(clientId: string): Promise<PairHistoryRow[]> {
  const supabase = await createClient();
  const since = toIsoDate(addDays(new Date(), -PAIR_HISTORY_DAYS));
  const { data, error } = await supabase
    .from('food_diary_entries')
    .select('daily_log_id, meal_section_id, food_id, portions, food:foods(*), daily_logs!inner(client_id, log_date)')
    .eq('daily_logs.client_id', clientId)
    .gte('daily_logs.log_date', since)
    .not('food_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(PAIR_HISTORY_ROWS);
  if (error) raise(error);
  return ((data ?? []) as unknown as PairHistoryRow[]).map((r) => ({
    daily_log_id: r.daily_log_id,
    meal_section_id: r.meal_section_id,
    food_id: r.food_id,
    portions: r.portions,
    food: r.food,
  }));
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
    if (!row.food || row.food.hidden || seen.has(row.food_id)) continue;
    seen.add(row.food_id);
    recent.push(row.food);
    if (recent.length >= RECENTLY_LOGGED_LIMIT) break;
  }
  return recent;
}
