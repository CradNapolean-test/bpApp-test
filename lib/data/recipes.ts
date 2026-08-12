'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { MealPlanSection, RecipeRow, RecipeWithIngredients } from './types';

export async function getRecipes(clientId: string): Promise<RecipeRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at');
  if (error) raise(error);
  return data ?? [];
}

export async function getRecipesWithIngredients(clientId: string): Promise<RecipeWithIngredients[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .select('*, recipe_ingredients(*, food:foods(*))')
    .eq('client_id', clientId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []) as unknown as RecipeWithIngredients[];
}

// Returns the new recipe's id so the caller can auto-open it straight into the
// ingredient picker, rather than requiring a second click to find it in the list.
export async function createRecipe(clientId: string, name: string, servings: number = 1): Promise<string> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('recipes')
    .insert({ client_id: clientId, name, servings })
    .select('id')
    .single();
  if (error) raise(error);
  return data.id;
}

export async function updateRecipeServings(recipeId: string, servings: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('recipes').update({ servings }).eq('id', recipeId);
  if (error) raise(error);
}

export async function deleteRecipe(recipeId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('recipes').delete().eq('id', recipeId);
  if (error) raise(error);
}

export async function addRecipeIngredient(recipeId: string, foodId: string, portions: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('recipe_ingredients')
    .insert({ recipe_id: recipeId, food_id: foodId, portions });
  if (error) raise(error);
}

export async function removeRecipeIngredient(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('recipe_ingredients').delete().eq('id', id);
  if (error) raise(error);
}

// Fans out a recipe's ingredients into individual food_diary_entries, scaled by servings --
// zero changes needed to foodTotals.ts or FoodTrackingTab, they just see plain food entries.
// `servings` here means "how many of the recipe's OWN serving size" (MyFitnessPal-style), so
// the ingredient portions scale by servings / recipe.servings, not by servings alone.
export async function logRecipeToDiary(
  dailyLogId: string,
  recipeId: string,
  servings: number,
  mealSectionId: string | null = null
): Promise<void> {
  const supabase = await createClient();
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('servings')
    .eq('id', recipeId)
    .single();
  if (recipeError) raise(recipeError);

  const { data: ingredients, error } = await supabase
    .from('recipe_ingredients')
    .select('food_id, portions')
    .eq('recipe_id', recipeId);
  if (error) raise(error);
  if (!ingredients || ingredients.length === 0) return;

  const scale = servings / recipe.servings;
  const rows = ingredients
    .filter((i) => i.food_id)
    .map((i) => ({
      daily_log_id: dailyLogId,
      food_id: i.food_id,
      portions: i.portions * scale,
      meal_section_id: mealSectionId,
    }));
  const { error: insertError } = await supabase.from('food_diary_entries').insert(rows);
  if (insertError) raise(insertError);
}

export async function addRecipeToMealPlan(
  clientId: string,
  section: MealPlanSection,
  recipeId: string,
  servings: number
): Promise<void> {
  const supabase = await createClient();
  const { data: recipe, error: recipeError } = await supabase
    .from('recipes')
    .select('servings')
    .eq('id', recipeId)
    .single();
  if (recipeError) raise(recipeError);

  const { data: ingredients, error } = await supabase
    .from('recipe_ingredients')
    .select('food_id, portions')
    .eq('recipe_id', recipeId);
  if (error) raise(error);
  if (!ingredients || ingredients.length === 0) return;

  const scale = servings / recipe.servings;
  const rows = ingredients
    .filter((i) => i.food_id)
    .map((i) => ({ client_id: clientId, section, food_id: i.food_id, portions: i.portions * scale }));
  const { error: insertError } = await supabase.from('meal_plan_entries').insert(rows);
  if (insertError) raise(insertError);
}
