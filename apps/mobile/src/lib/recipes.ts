import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { FoodRow, RecipeIngredientRow, RecipeWithIngredients } from '@ballistic/shared/data/types';
import { MAX_SERVINGS, validatePortions, validateRecipeName } from '@ballistic/shared/utils/mealPlan';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The member's recipes with their ingredients and each ingredient's food, in one request.
export function useRecipes() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['recipes', userId],
    queryFn: async (): Promise<RecipeWithIngredients[]> => {
      const { data, error } = await supabase.from('recipes').select('*, recipe_ingredients(*, food:foods(*))').eq('client_id', userId).order('created_at').limit(100);
      if (error) throw error;
      return (data ?? []) as unknown as RecipeWithIngredients[];
    },
  });
}

// Every recipe write: change the cached list at once, put it back if the save fails, and check with the server afterwards.
function useRecipeMutation<V>(write: (userId: string, vars: V) => Promise<void>, optimistic: (rows: RecipeWithIngredients[], vars: V, userId: string) => RecipeWithIngredients[]) {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['recipes', userId];
  return useMutation({
    mutationFn: async (vars: V) => write(userId, vars),
    onMutate: async (vars: V) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<RecipeWithIngredients[]>(key);
      qc.setQueryData<RecipeWithIngredients[]>(key, (rows = []) => optimistic(rows, vars, userId));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}

const fail = (message: string) => {
  throw new Error(message);
};

// Returns the new recipe's id so the screen can open it straight into the ingredient picker.
export function useCreateRecipe() {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, servings }: { name: string; servings: number }): Promise<string> => {
      const problem = validateRecipeName(name);
      if (problem) fail(problem);
      const { data, error } = await supabase.from('recipes').insert({ client_id: userId, name: name.trim(), servings: Math.min(MAX_SERVINGS, Math.max(1, servings)) }).select('id').single();
      if (error) throw new Error('Could not create the recipe.');
      return data.id as string;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['recipes', userId] }),
  });
}

// Corrects a recipe's name (RC1): it used to be fixed once created, so a typo meant deleting the recipe and its ingredients.
export function useRenameRecipe() {
  return useRecipeMutation<{ recipeId: string; name: string }>(
    async (_u, { recipeId, name }) => {
      const problem = validateRecipeName(name);
      if (problem) fail(problem);
      const { error } = await supabase.from('recipes').update({ name: name.trim() }).eq('id', recipeId);
      if (error) throw new Error('Could not rename the recipe.');
    },
    (rows, { recipeId, name }) => rows.map((r) => (r.id === recipeId ? { ...r, name: name.trim() } : r)),
  );
}

export function useUpdateServings() {
  return useRecipeMutation<{ recipeId: string; servings: number }>(
    async (_u, { recipeId, servings }) => {
      const { error } = await supabase.from('recipes').update({ servings }).eq('id', recipeId);
      if (error) throw new Error('Could not save the servings.');
    },
    (rows, { recipeId, servings }) => rows.map((r) => (r.id === recipeId ? { ...r, servings } : r)),
  );
}

export function useDeleteRecipe() {
  return useRecipeMutation<{ recipeId: string }>(
    async (_u, { recipeId }) => {
      const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
      if (error) throw new Error('Could not delete the recipe.');
    },
    (rows, { recipeId }) => rows.filter((r) => r.id !== recipeId),
  );
}

export function useAddIngredient() {
  return useRecipeMutation<{ recipeId: string; food: FoodRow; portions: number }>(
    async (_u, { recipeId, food, portions }) => {
      const problem = validatePortions(portions);
      if (problem) fail(problem);
      const { error } = await supabase.from('recipe_ingredients').insert({ recipe_id: recipeId, food_id: food.id, portions });
      if (error) throw new Error('Could not add that ingredient.');
    },
    (rows, { recipeId, food, portions }) =>
      rows.map((r) => (r.id === recipeId ? { ...r, recipe_ingredients: [...r.recipe_ingredients, { id: 'pending-' + Math.random().toString(36).slice(2), recipe_id: recipeId, food_id: food.id, portions, food } as RecipeIngredientRow] } : r)),
  );
}

export function useUpdateIngredient() {
  return useRecipeMutation<{ id: string; portions: number }>(
    async (_u, { id, portions }) => {
      const problem = validatePortions(portions);
      if (problem) fail(problem);
      const { error } = await supabase.from('recipe_ingredients').update({ portions }).eq('id', id);
      if (error) throw new Error('Could not save that amount.');
    },
    (rows, { id, portions }) => rows.map((r) => ({ ...r, recipe_ingredients: r.recipe_ingredients.map((i) => (i.id === id ? { ...i, portions } : i)) })),
  );
}

export function useRemoveIngredient() {
  return useRecipeMutation<{ id: string }>(
    async (_u, { id }) => {
      const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
      if (error) throw new Error('Could not remove that ingredient.');
    },
    (rows, { id }) => rows.map((r) => ({ ...r, recipe_ingredients: r.recipe_ingredients.filter((i) => i.id !== id) })),
  );
}
