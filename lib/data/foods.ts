'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { PairHistoryRow } from '@/lib/foodPairs';
import { addDays, toIsoDate } from '@/lib/utils/dates';
import type { ServingOption } from '@/lib/utils/foodUnits';
import { addedProduct, type BarcodeFoodFields, type ProductCorrection } from '@/lib/utils/barcodeFoods';
import type { ActivityRow, FoodAddition, FoodRow, ScannedFoodRow } from './types';

// `limit`: the Add food picker asks for more than it shows, because it folds near-duplicate products into one result (D23a).
export async function searchFoods(query: string, limit = 25): Promise<FoodRow[]> {
  const supabase = await createClient();
  const q = query.trim();
  const max = Math.min(100, Math.max(1, Math.round(limit)));
  if (q) {
    // Ranked multi-word search over the whole UK database (migration 0074): exact and starts-with
    // matches first, then UK generics, scanned/imported products, and the old seed last.
    const ranked = await supabase.rpc('search_foods', { p_query: q, p_limit: max });
    if (!ranked.error) return (ranked.data ?? []) as FoodRow[];
    // Not applied yet (or any other failure): fall back to the plain name search below.
  }
  // Hidden foods stay out of the fallback too (M12), as they do in search_foods.
  let request = supabase.from('foods').select('*').eq('hidden', false).order('name').limit(max);
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

// The scan's first look: the food for this barcode, or that a coach has hidden it (so the scan can say so instead of looking it up on
// Open Food Facts or offering to add it again, which the database would refuse).
export async function findFoodByBarcode(barcode: string): Promise<{ food: FoodRow | null; hidden: boolean }> {
  const found = await findByBarcode(barcode);
  return { food: found && !found.hidden ? found : null, hidden: found?.hidden === true };
}

export type AddBarcodeFoodResult = { ok: true; food: FoodRow; existing: boolean } | { ok: false; error: string };

// "Add this product" (owner's list item 6, migration 0173): a product nobody has added, typed in from the pack, into the shared food list.
// One food per barcode: if someone added it first, theirs comes back with existing true. A refusal (figures, a hidden product, more than 30
// typed in from the pack in a day) comes back as its message rather than being thrown, which production would hide.
export async function addBarcodeFood(barcode: string, fields: BarcodeFoodFields): Promise<AddBarcodeFoodResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('add_barcode_food', {
    p_barcode: barcode,
    p_name: fields.name,
    p_brand: fields.brand,
    p_protein: fields.protein,
    p_carbs: fields.carbs,
    p_fat: fields.fat,
    p_serving_options: fields.serving_options,
  });
  if (error) {
    const failed = fail(error, 'Could not add that product. Try again.');
    if (!failed.ok) return failed;
  }
  const added = addedProduct(data);
  if (!added) return { ok: false, error: 'Could not add that product. Try again.' };
  return { ok: true, ...added };
}

// Caches a barcode-scanned product into the shared foods table. Never overwrites an
// existing row for that barcode (ON CONFLICT DO NOTHING) — if a lookup lands on a barcode
// someone already cached (or that was in the original seed data), we just hand back what's
// already there rather than risk clobbering curated macros with a lower-quality OFF entry.
// A refusal the member must read (a hidden product, or any refusal the database words for them) comes back as its message rather than
// being thrown, which production would hide. The daily limit on new products (0173) never refuses this: only products typed in from the
// pack (addBarcodeFood) count towards it, not ones filled in from Open Food Facts (the owner's decision, 20 Nov 2026).
export async function upsertFoodFromBarcode(
  barcode: string,
  fields: { name: string; portion: string; protein: number; carbs: number; fat: number; fibre?: number | null; serving_options?: ServingOption[] | null }
): Promise<{ ok: true; food: FoodRow } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error: insertError } = await supabase
    .from('foods')
    // The insert policy (0106) allows names of 1-200 characters; Open Food Facts names can be longer.
    .insert({ barcode, source: 'scan', ...fields, name: fields.name.trim().slice(0, 200) })
    .select()
    .maybeSingle();
  // Conflict on the unique barcode column is expected/harmless when another session (or a
  // prior scan) already cached this barcode — fall through to the select below either way.
  if (insertError && insertError.code !== '23505') {
    const failed = fail(insertError, 'Could not save that product. Try again.');
    if (!failed.ok) return failed;
  }

  const existing = await findByBarcode(barcode);
  if (!existing) return { ok: false, error: 'Could not save that product. Try again.' };
  // The product was scanned before and a coach hid it (it was wrong). Say so, rather than adding it again or failing without a reason.
  if (existing.hidden) return { ok: false, error: 'This product has been taken off the food list. Add it with Quick Add instead, or ask your coach.' };
  return { ok: true, food: existing };
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
export async function searchScannedFoods(query: string): Promise<ScannedFoodRow[]> {
  const supabase = await createClient();
  const q = query.trim().replace(/[%,()]/g, ' ').trim();
  let request = supabase.from('foods').select('*').eq('source', 'scan').order('name').limit(40);
  if (q) request = request.or(`name.ilike.%${q}%,barcode.ilike.%${q}%,brand.ilike.%${q}%`);
  const { data, error } = await request;
  if (error) raise(error);
  const foods = (data ?? []) as FoodRow[];
  const additions = await readAdditions(supabase, foods.map((f) => f.id));
  return foods.map((f) => ({ ...f, addition: additions.get(f.id) ?? null }));
}

type AdditionRow = { food_id: string; added_by: string | null; added_at: string; typed: boolean };

// Who added these products (migration 0173), with names where the coach can read them. The read rule only shows additions by members of
// the coach's own gym. Missing (0173 not applied yet) or failing, it is no additions: the list still works without "Added by".
async function readAdditions(supabase: Awaited<ReturnType<typeof createClient>>, foodIds: string[]): Promise<Map<string, FoodAddition>> {
  const out = new Map<string, FoodAddition>();
  if (foodIds.length === 0) return out;
  const { data, error } = await supabase.from('food_additions').select('food_id, added_by, added_at, typed').in('food_id', foodIds);
  if (error || !data) return out;
  const names = await adderNames(supabase, (data as AdditionRow[]).map((a) => a.added_by));
  for (const a of data as AdditionRow[]) {
    out.set(a.food_id, { added_by: a.added_by, added_at: a.added_at, typed: a.typed, adder_name: a.added_by ? names.get(a.added_by) ?? null : null });
  }
  return out;
}

// A member's name from their profile, a coach's display name; only the people this coach may read (the profiles read rules decide).
async function adderNames(supabase: Awaited<ReturnType<typeof createClient>>, ids: (string | null)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await supabase.from('profiles').select('id, display_name, client_profiles(name)').in('id', unique);
  for (const p of (data ?? []) as { id: string; display_name: string | null; client_profiles: { name: string | null } | { name: string | null }[] | null }[]) {
    const member = Array.isArray(p.client_profiles) ? p.client_profiles[0] : p.client_profiles;
    const name = member?.name?.trim() || p.display_name?.trim();
    if (name) names.set(p.id, name);
  }
  return names;
}

// "Added by members" in Library > Foods: products this coach's gym's members typed in from the pack (0173), newest first, hidden ones
// included so they can be brought back. Filtered by name, brand or barcode here (the list is at most the latest 100).
export async function listMemberAddedFoods(query: string): Promise<ScannedFoodRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('food_additions')
    .select('food_id, added_by, added_at, typed, food:foods(*)')
    .eq('typed', true)
    .order('added_at', { ascending: false })
    .limit(100);
  if (error) raise(error);
  const rows = (data ?? []) as unknown as (AdditionRow & { food: FoodRow | null })[];
  const names = await adderNames(supabase, rows.map((r) => r.added_by));
  const q = query.trim().toLowerCase();
  return rows
    .filter((r): r is AdditionRow & { food: FoodRow } => r.food != null)
    .filter((r) => !q || [r.food.name, r.food.brand ?? '', r.food.barcode ?? ''].some((s) => s.toLowerCase().includes(q)))
    .slice(0, 40)
    .map((r) => ({
      ...r.food,
      addition: { added_by: r.added_by, added_at: r.added_at, typed: r.typed, adder_name: r.added_by ? names.get(r.added_by) ?? null : null },
    }));
}

// A coach corrects a scanned product's name, brand and figures (per gram), for every member at every gym: the shared list has one food per
// barcode. Days that already include it count the corrected figures. Only coaches can, and only on scanned products (migration 0128); a
// row that cannot be changed updates nothing, so say so. Only the fields given are written (what the coach changed, readProductCorrection),
// so a figure the coach left alone keeps its stored value.
export async function correctScannedFood(foodId: string, fields: ProductCorrection): Promise<ActionResult> {
  const changes: ProductCorrection = {};
  for (const key of ['name', 'brand', 'protein', 'carbs', 'fat'] as const) {
    if (fields[key] !== undefined) Object.assign(changes, { [key]: fields[key] });
  }
  if (Object.keys(changes).length === 0) return fail({ message: 'Nothing has changed yet. Change what is wrong, or Cancel.' });
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('foods')
    .update(changes)
    .eq('id', foodId)
    .eq('source', 'scan')
    .select('id');
  if (error) return fail(error, 'Could not save that correction.');
  if (!data || data.length === 0) return fail({ message: 'Only scanned products can be corrected, and only by a coach.' });
  return ok();
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
