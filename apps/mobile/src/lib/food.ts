import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useCallback } from 'react';

import type { FoodDiaryEntryRow, FoodRow, MealSectionRow, NutritionFeedbackRow } from '@ballistic/shared/data/types';
import { lookupBarcode } from '@ballistic/shared/openFoodFacts';
import { barcodeVariants } from '@ballistic/shared/utils/barcode';
import type { OwnUnitRow, ServingOption } from '@ballistic/shared/utils/foodUnits';
import type { QuickAddFields } from '@ballistic/shared/utils/quickAdd';

import { diaryKey } from '@/lib/queryKeys';
import {
  getOrCreateLogId,
  syncDiaryToLog,
  WRITE_DIARY_ADD,
  WRITE_DIARY_PORTIONS,
  WRITE_DIARY_QUICK_UPDATE,
  WRITE_DIARY_REFILE,
  WRITE_DIARY_REMOVE,
  type DiaryAddVars,
  type DiaryPortionsVars,
  type DiaryQuickUpdateVars,
  type DiaryRefileVars,
  type DiaryRemoveVars,
  type DiaryRowInput,
} from '@/lib/queuedWrites';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useQueuedWrite } from '@/lib/writeQueue';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

export type DiaryData = { dailyLogId: string | null; entries: FoodDiaryEntryRow[] };
export type { QuickAddFields };

const DEFAULT_SECTIONS = ['Breakfast', 'Lunch', 'Dinner', 'Snacks'];

// ---------- meal sections ----------
// Seeds the four defaults on first use. Upsert + ignoreDuplicates (unique client_id,label) so two concurrent calls
// cannot create them twice (same fix as the web).
export function useMealSections() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['meal-sections', userId],
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<MealSectionRow[]> => {
      const read = async () => {
        const { data, error } = await supabase.from('meal_sections').select('*').eq('client_id', userId).order('sort_order');
        if (error) throw error;
        return (data ?? []) as MealSectionRow[];
      };
      const existing = await read();
      if (existing.length) return existing;
      const { error } = await supabase
        .from('meal_sections')
        .upsert(DEFAULT_SECTIONS.map((label, i) => ({ client_id: userId, label, sort_order: i })), { onConflict: 'client_id,label', ignoreDuplicates: true });
      if (error) throw error;
      return read();
    },
  });
}

// ---------- the diary for one day: one request ----------
// Only READS: a day with no row comes back empty, and the row is made when the first food is added to it.
export async function fetchDiary(userId: string, date: string): Promise<DiaryData> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('id, food_diary_entries(*, food:foods(*))')
    .eq('client_id', userId)
    .eq('log_date', date)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { dailyLogId: null, entries: [] };
  const row = data as unknown as { id: string; food_diary_entries: FoodDiaryEntryRow[] };
  return { dailyLogId: row.id, entries: row.food_diary_entries ?? [] };
}

export function useDiary(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: diaryKey(userId, date),
    enabled,
    queryFn: () => fetchDiary(userId, date),
  });
}

// What the coach wrote about this day's food (or about a meal photo), oldest first. Members can read their own; only their
// coach can write it (RLS, migration 0085). Opened from the "Your coach left feedback" notification and push.
export function useNutritionFeedback(date: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['nutrition-feedback', userId, date],
    enabled,
    queryFn: async (): Promise<NutritionFeedbackRow[]> => {
      const { data, error } = await supabase.from('nutrition_feedback').select('*').eq('client_id', userId).eq('log_date', date).order('created_at');
      if (error) throw error;
      return (data ?? []) as NutritionFeedbackRow[];
    },
  });
}

// ---------- writes ----------
// Every diary write works with no signal: the diary on screen changes at once (cancelling any fetch in flight first, so it
// cannot overwrite the change), and the write itself is queued (lib/queuedWrites.ts, lib/writeQueue.ts). The rows carry an id
// made on the phone, so what the screen shows is the row that will exist on the server.
const emptyDiary: DiaryData = { dailyLogId: null, entries: [] };

function useDiaryCacheUpdate(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useCallback(
    async (update: (old: DiaryData) => DiaryData) => {
      const key = diaryKey(userId, date);
      await qc.cancelQueries({ queryKey: key });
      qc.setQueryData<DiaryData>(key, (old) => update(old ?? emptyDiary));
    },
    [qc, userId, date],
  );
}

function newRow(fields: Partial<DiaryRowInput>): DiaryRowInput {
  return {
    id: randomUUID(),
    created_at: new Date().toISOString(),
    food_id: null,
    portions: 1,
    meal_section_id: null,
    quick_add_name: null,
    quick_add_calories: null,
    quick_add_protein: null,
    quick_add_carbs: null,
    quick_add_fat: null,
    ...fields,
  };
}

const entryOf = (row: DiaryRowInput, dailyLogId: string | null, food: FoodRow | null): FoodDiaryEntryRow => ({
  ...row,
  daily_log_id: dailyLogId ?? 'pending',
  food,
});

type FoodItem = { food: FoodRow; portions: number; sectionId: string | null };
type AddItem = { food: FoodRow | null; fields: Partial<DiaryRowInput> };

const foodItem = (i: FoodItem): AddItem => ({ food: i.food, fields: { food_id: i.food.id, portions: i.portions, meal_section_id: i.sectionId } });
const oneFood = (i: FoodItem): AddItem[] => [foodItem(i)];
const manyFoods = ({ items }: { items: FoodItem[] }): AddItem[] => items.map(foodItem);
const quickItem = ({ fields, sectionId }: { fields: QuickAddFields; sectionId: string | null }): AddItem[] => [
  {
    food: null,
    fields: {
      meal_section_id: sectionId,
      quick_add_name: fields.name,
      quick_add_calories: fields.calories,
      quick_add_protein: fields.protein,
      quick_add_carbs: fields.carbs,
      quick_add_fat: fields.fat,
    },
  },
];

function useDiaryAdd<TInput>(date: string, itemsOf: (input: TInput) => AddItem[]) {
  const userId = useUserId();
  const updateDiary = useDiaryCacheUpdate(date);
  const toVars = useCallback((input: TInput): DiaryAddVars => ({ userId, date, rows: itemsOf(input).map((i) => newRow(i.fields)) }), [userId, date, itemsOf]);
  const apply = useCallback(
    (input: TInput, vars: DiaryAddVars) => {
      const foods = itemsOf(input).map((i) => i.food);
      return updateDiary((old) => ({ ...old, entries: [...old.entries, ...vars.rows.map((row, n) => entryOf(row, old.dailyLogId, foods[n]))] }));
    },
    [updateDiary, itemsOf],
  );
  return useQueuedWrite({ key: WRITE_DIARY_ADD, toVars, apply });
}

export const useAddFood = (date: string) => useDiaryAdd<FoodItem>(date, oneFood);

// Several foods at once (a recipe's ingredients, or a planned meal copied into the diary), each with its own section.
export const useAddFoods = (date: string) => useDiaryAdd<{ items: FoodItem[] }>(date, manyFoods);

// Quick Add: a row with no food, for something with no database match (a restaurant meal, an estimate).
export const useAddQuickAdd = (date: string) => useDiaryAdd<{ fields: QuickAddFields; sectionId: string | null }>(date, quickItem);

export function useRemoveEntry(date: string) {
  const userId = useUserId();
  const updateDiary = useDiaryCacheUpdate(date);
  const toVars = useCallback((input: { id: string }): DiaryRemoveVars => ({ userId, date, id: input.id }), [userId, date]);
  const apply = useCallback((input: { id: string }) => updateDiary((old) => ({ ...old, entries: old.entries.filter((e) => e.id !== input.id) })), [updateDiary]);
  return useQueuedWrite({ key: WRITE_DIARY_REMOVE, toVars, apply });
}

// "File under": moves an entry sitting in "Other" into one of the member's own sections.
export function useRefileEntry(date: string) {
  const userId = useUserId();
  const updateDiary = useDiaryCacheUpdate(date);
  const toVars = useCallback((input: { id: string; sectionId: string }): DiaryRefileVars => ({ userId, date, id: input.id, sectionId: input.sectionId }), [userId, date]);
  const apply = useCallback(
    (input: { id: string; sectionId: string }) => updateDiary((old) => ({ ...old, entries: old.entries.map((e) => (e.id === input.id ? { ...e, meal_section_id: input.sectionId } : e)) })),
    [updateDiary],
  );
  return useQueuedWrite({ key: WRITE_DIARY_REFILE, toVars, apply });
}

// Edit a Quick Add row in place (name, calories, macros).
export function useUpdateQuickAdd(date: string) {
  const userId = useUserId();
  const updateDiary = useDiaryCacheUpdate(date);
  const toVars = useCallback((input: { id: string; fields: QuickAddFields }): DiaryQuickUpdateVars => ({ userId, date, id: input.id, fields: input.fields }), [userId, date]);
  const apply = useCallback(
    (input: { id: string; fields: QuickAddFields }) =>
      updateDiary((old) => ({
        ...old,
        entries: old.entries.map((e) =>
          e.id === input.id && !e.food_id
            ? { ...e, quick_add_name: input.fields.name, quick_add_calories: input.fields.calories, quick_add_protein: input.fields.protein, quick_add_carbs: input.fields.carbs, quick_add_fat: input.fields.fat }
            : e,
        ),
      })),
    [updateDiary],
  );
  return useQueuedWrite({ key: WRITE_DIARY_QUICK_UPDATE, toVars, apply });
}

export function useUpdatePortions(date: string) {
  const userId = useUserId();
  const updateDiary = useDiaryCacheUpdate(date);
  const toVars = useCallback((input: { id: string; portions: number }): DiaryPortionsVars => ({ userId, date, id: input.id, portions: input.portions }), [userId, date]);
  const apply = useCallback(
    (input: { id: string; portions: number }) => updateDiary((old) => ({ ...old, entries: old.entries.map((e) => (e.id === input.id ? { ...e, portions: input.portions } : e)) })),
    [updateDiary],
  );
  return useQueuedWrite({ key: WRITE_DIARY_PORTIONS, toVars, apply });
}

// "Copy from yesterday": copies the source day's entries (food and Quick Add rows, same sections) into this day.
// Returns how many were copied; 0 when the source day had nothing.
export function useCopyFromDate(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (fromDate: string): Promise<number> => {
      const { data, error } = await supabase.from('daily_logs').select('id, food_diary_entries(*)').eq('client_id', userId).eq('log_date', fromDate).maybeSingle();
      if (error) throw error;
      const source = ((data as unknown as { food_diary_entries: FoodDiaryEntryRow[] } | null)?.food_diary_entries) ?? [];
      if (!source.length) return 0;
      const toLogId = qc.getQueryData<DiaryData>(diaryKey(userId, date))?.dailyLogId ?? (await getOrCreateLogId(userId, date));
      const copies = source.map((e) => ({
        daily_log_id: toLogId, food_id: e.food_id, portions: e.portions, meal_section_id: e.meal_section_id,
        quick_add_name: e.quick_add_name, quick_add_calories: e.quick_add_calories, quick_add_protein: e.quick_add_protein,
        quick_add_carbs: e.quick_add_carbs, quick_add_fat: e.quick_add_fat,
      }));
      const { error: insertError } = await supabase.from('food_diary_entries').insert(copies);
      if (insertError) throw insertError;
      await syncDiaryToLog(toLogId);
      return copies.length;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: diaryKey(userId, date) });
      qc.invalidateQueries({ queryKey: ['daily-logs', userId] });
    },
  });
}

// ---------- search, favourites, recently logged ----------
// Ranked multi-word search (migration 0074); falls back to a plain name match if the RPC is unavailable.
export function useFoodSearch(query: string) {
  const q = query.trim();
  return useQuery({
    queryKey: ['food-search', q.toLowerCase()],
    enabled: q.length >= 2,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<FoodRow[]> => {
      const ranked = await supabase.rpc('search_foods', { p_query: q, p_limit: 25 });
      if (!ranked.error) return (ranked.data ?? []) as FoodRow[];
      // Hidden foods stay out of the fallback too (M12), as they do in search_foods.
      const { data, error } = await supabase.from('foods').select('*').eq('hidden', false).ilike('name', `%${q}%`).order('name').limit(25);
      if (error) throw error;
      return (data ?? []) as FoodRow[];
    },
  });
}

// A member's own serving units ("my rasher = 30 g"), private to them; the built-in ones come with each food.
export function useOwnFoodUnits() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['food-units', userId];
  const query = useQuery({
    queryKey: key,
    queryFn: async (): Promise<OwnUnitRow[]> => {
      const { data, error } = await supabase.from('member_food_units').select('id, food_id, label, grams').eq('client_id', userId);
      if (error) throw error;
      return (data ?? []).map((r) => ({ ...r, grams: Number(r.grams) }));
    },
  });
  // Resolves to an error message to show, or null when saved.
  const save = async (foodId: string, label: string, grams: number): Promise<string | null> => {
    const { error } = await supabase.from('member_food_units').insert({ client_id: userId, food_id: foodId, label, grams });
    if (error) {
      if (error.code === '23505') return 'You already have a unit with that name for this food.';
      return error.message.includes('most units') ? error.message : 'Could not save that unit. Try again.';
    }
    await qc.invalidateQueries({ queryKey: key });
    return null;
  };
  const remove = async (id: string) => {
    qc.setQueryData<OwnUnitRow[]>(key, (old = []) => old.filter((u) => u.id !== id));
    await supabase.from('member_food_units').delete().eq('id', id);
    await qc.invalidateQueries({ queryKey: key });
  };
  return { units: query.data ?? [], save, remove };
}

export function useFavoriteFoods() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['favorites', userId],
    queryFn: async (): Promise<FoodRow[]> => {
      const { data, error } = await supabase.from('food_favorites').select('created_at, food:foods(*)').eq('client_id', userId).order('created_at', { ascending: false });
      if (error) throw error;
      // A food a coach has hidden (a wrong scanned product) drops out of favourites too (M12).
      return ((data ?? []) as unknown as { food: FoodRow | null }[]).map((r) => r.food).filter((f): f is FoodRow => !!f && !f.hidden);
    },
  });
}

// Derived, not maintained: the last 50 logged foods, de-duplicated, newest first, capped at 8.
export function useRecentFoods() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['recent-foods', userId],
    queryFn: async (): Promise<FoodRow[]> => {
      const { data, error } = await supabase
        .from('food_diary_entries')
        .select('food_id, created_at, food:foods(*), daily_logs!inner(client_id)')
        .eq('daily_logs.client_id', userId)
        .not('food_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      const seen = new Set<string>();
      const recent: FoodRow[] = [];
      for (const row of (data ?? []) as unknown as { food_id: string; food: FoodRow | null }[]) {
        if (!row.food || row.food.hidden || seen.has(row.food_id)) continue;
        seen.add(row.food_id);
        recent.push(row.food);
        if (recent.length >= 8) break;
      }
      return recent;
    },
  });
}

export function useToggleFavorite() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['favorites', userId];
  return useMutation({
    mutationFn: async ({ food, isFavorite }: { food: FoodRow; isFavorite: boolean }) => {
      if (isFavorite) {
        const { error } = await supabase.from('food_favorites').upsert({ client_id: userId, food_id: food.id });
        if (error) throw error;
      } else {
        const { error } = await supabase.from('food_favorites').delete().eq('client_id', userId).eq('food_id', food.id);
        if (error) throw error;
      }
    },
    onMutate: async ({ food, isFavorite }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<FoodRow[]>(key);
      qc.setQueryData<FoodRow[]>(key, (old = []) => (isFavorite ? [food, ...old.filter((f) => f.id !== food.id)] : old.filter((f) => f.id !== food.id)));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

// ---------- barcode ----------
// A food a coach has hidden is not found by a scan (M12). It still holds its unique barcode, so the caller that caches the product again
// has to tell "nothing here" from "hidden": visible rows sort first, and findByBarcode hands back whichever it finds.
async function findByBarcode(barcode: string): Promise<FoodRow | null> {
  const { data, error } = await supabase.from('foods').select('*').in('barcode', barcodeVariants(barcode)).order('hidden').limit(1);
  if (error) throw error;
  return ((data ?? [])[0] as FoodRow | undefined) ?? null;
}

export async function getFoodByBarcode(barcode: string): Promise<FoodRow | null> {
  const found = await findByBarcode(barcode);
  return found && !found.hidden ? found : null;
}

// Caches a scanned product in the shared foods table. Never overwrites an existing row for that barcode
// (the unique barcode column makes a duplicate insert a harmless 23505), so curated macros are not clobbered.
export async function upsertFoodFromBarcode(
  barcode: string,
  fields: { name: string; portion: string; protein: number; carbs: number; fat: number; fibre?: number | null; serving_options?: ServingOption[] | null },
): Promise<FoodRow> {
  // The insert policy (0106) allows names of 1-200 characters; Open Food Facts names can be longer.
  const { error } = await supabase.from('foods').insert({ barcode, source: 'scan', ...fields, name: fields.name.trim().slice(0, 200) });
  if (error && error.code !== '23505') throw error;
  const existing = await findByBarcode(barcode);
  if (!existing) throw new Error('Failed to cache scanned food');
  // The product was scanned before and a coach hid it (it was wrong). Say so, rather than adding it again or failing without a reason.
  if (existing.hidden) throw new Error('This product has been taken off the food list. Add it with Quick Add instead, or ask your coach.');
  return existing;
}

// Fills in the pack's serving on a scanned food that has none yet (the database refuses anything else for a member, migration 0148).
export async function setFoodServings(foodId: string, options: ServingOption[]): Promise<boolean> {
  const { data, error } = await supabase.rpc('set_food_servings', { p_food_id: foodId, p_options: options });
  return !error && data === true;
}

export { lookupBarcode };
