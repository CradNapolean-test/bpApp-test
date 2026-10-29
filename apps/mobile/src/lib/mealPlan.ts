import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FoodRow, MealPlanEntryRow, MealPlanSection, MealSectionRow, RecipeWithIngredients } from '@ballistic/shared/data/types';
import { diarySectionIdFor, scaleIngredients, validatePortions } from '@ballistic/shared/utils/mealPlan';
import { newPlanRows } from '@ballistic/shared/utils/planLogging';

import { fetchDiary, useAddFoods, type DiaryData } from '@/lib/food';
import { diaryKey } from '@/lib/queryKeys';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The member's planned meals, each with its food. One request.
export function useMealPlan() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['meal-plan', userId],
    queryFn: async (): Promise<MealPlanEntryRow[]> => {
      const { data, error } = await supabase.from('meal_plan_entries').select('*, food:foods(*)').eq('client_id', userId).limit(500);
      if (error) throw error;
      return (data ?? []) as unknown as MealPlanEntryRow[];
    },
  });
}

function useMealPlanMutation<V>(write: (userId: string, vars: V) => Promise<void>, optimistic: (rows: MealPlanEntryRow[], vars: V, userId: string) => MealPlanEntryRow[]) {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['meal-plan', userId];
  return useMutation({
    mutationFn: async (vars: V) => write(userId, vars),
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<MealPlanEntryRow[]>(key);
      qc.setQueryData<MealPlanEntryRow[]>(key, (rows = []) => optimistic(rows, vars, userId));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

const temp = (userId: string, section: MealPlanSection, food: FoodRow, portions: number): MealPlanEntryRow => ({ id: 'pending-' + Math.random().toString(36).slice(2), client_id: userId, section, food_id: food.id, portions, food });

export function useAddPlanFood() {
  return useMealPlanMutation<{ section: MealPlanSection; food: FoodRow; portions: number }>(
    async (userId, { section, food, portions }) => {
      const problem = validatePortions(portions);
      if (problem) throw new Error(problem);
      const { error } = await supabase.from('meal_plan_entries').insert({ client_id: userId, section, food_id: food.id, portions });
      if (error) throw new Error('Could not add that to your plan.');
    },
    (rows, { section, food, portions }, userId) => [...rows, temp(userId, section, food, portions)],
  );
}

// A recipe goes into the plan as its ingredients, scaled to the servings asked for.
export function useAddPlanRecipe() {
  return useMealPlanMutation<{ section: MealPlanSection; recipe: RecipeWithIngredients; servings: number }>(
    async (userId, { section, recipe, servings }) => {
      const scaled = scaleIngredients(recipe.recipe_ingredients, servings, recipe.servings);
      if (scaled.length === 0) return;
      const bad = scaled.map((s) => validatePortions(s.portions)).find(Boolean);
      if (bad) throw new Error(bad);
      const { error } = await supabase.from('meal_plan_entries').insert(scaled.map((s) => ({ client_id: userId, section, food_id: s.food_id, portions: s.portions })));
      if (error) throw new Error('Could not add that recipe to your plan.');
    },
    (rows, { section, recipe, servings }, userId) => {
      const scaled = scaleIngredients(recipe.recipe_ingredients, servings, recipe.servings);
      const added = scaled.map((s) => temp(userId, section, recipe.recipe_ingredients.find((i) => i.food_id === s.food_id)!.food as FoodRow, s.portions));
      return [...rows, ...added];
    },
  );
}

export function useUpdatePlanPortions() {
  return useMealPlanMutation<{ id: string; portions: number }>(
    async (_u, { id, portions }) => {
      const problem = validatePortions(portions);
      if (problem) throw new Error(problem);
      const { error } = await supabase.from('meal_plan_entries').update({ portions }).eq('id', id);
      if (error) throw new Error('Could not save that amount.');
    },
    (rows, { id, portions }) => rows.map((r) => (r.id === id ? { ...r, portions } : r)),
  );
}

export function useRemovePlanEntry() {
  return useMealPlanMutation<{ id: string }>(
    async (_u, { id }) => {
      const { error } = await supabase.from('meal_plan_entries').delete().eq('id', id);
      if (error) throw new Error('Could not remove that.');
    },
    (rows, { id }) => rows.filter((r) => r.id !== id),
  );
}

export const PLAN_CHECK_FAILED = "Could not check today's diary. Try again when you have signal.";
const DIARY_CHECK_TIMEOUT_MS = 8000;

// Copies one planned meal (or the whole plan) into a day's food diary, filed under the matching diary section.
// What is already in the diary (the same food, section and amount) is skipped, so tapping it twice no longer doubles every entry (MP1).
// It looks at the diary the screens already hold, which includes foods still waiting to be saved, else reads it; if the diary cannot be
// read at all it adds nothing and says so, because adding blindly is exactly how entries got doubled.
export function useLogPlanToDiary(date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  const addFoods = useAddFoods(date);
  return {
    ...addFoods,
    logPlan: async (entries: MealPlanEntryRow[], which: MealPlanSection | 'all', sections: MealSectionRow[]): Promise<{ added: number; planned: number }> => {
      const chosen = entries.filter((e) => e.food && (which === 'all' || e.section === which));
      const planned = chosen.map((e) => {
        const sectionId = diarySectionIdFor(e.section, sections);
        return { food: e.food as FoodRow, portions: e.portions, sectionId, food_id: (e.food as FoodRow).id, meal_section_id: sectionId };
      });
      if (planned.length === 0) return { added: 0, planned: 0 };
      let diary: DiaryData;
      try {
        // networkMode 'always': without it a query waits for a connection, so with no signal the check would hang with no message.
        // It is also given up on after a few seconds, so a weak signal ends in the message rather than a button that never comes back.
        const read = qc.ensureQueryData({ queryKey: diaryKey(userId, date), queryFn: () => fetchDiary(userId, date), networkMode: 'always' });
        diary = await Promise.race([read, new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), DIARY_CHECK_TIMEOUT_MS))]);
      } catch {
        throw new Error(PLAN_CHECK_FAILED);
      }
      const fresh = newPlanRows(planned, diary.entries);
      if (fresh.length > 0) addFoods.mutate({ items: fresh });
      return { added: fresh.length, planned: planned.length };
    },
  };
}
