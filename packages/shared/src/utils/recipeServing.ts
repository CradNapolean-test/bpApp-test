// How much one serving of a recipe weighs (NU15): "556 kcal a serving, makes 5" did not say how much of the pot that is. Twin of
// lib/utils/recipeServing.ts (the web): keep the two the same.
//
// It is the weight of the ingredients as they were entered, divided by the servings. A food weighed in grams counts its grams; a food
// counted by the portion ("1 Egg") has no weight in the database, so it is left out and counted in `unweighed` for the label to say.

export interface RecipeServingWeight {
  // Grams of weighed ingredients in one serving.
  perServing: number;
  // Grams of weighed ingredients in the whole recipe.
  total: number;
  // How many ingredients have no weight (counted by the portion), so are not in the grams.
  unweighed: number;
}

export function recipeServingWeight(
  ingredients: { portions: number; food: { portion: string | null } | null }[],
  servings: number,
): RecipeServingWeight | null {
  let total = 0;
  let unweighed = 0;
  for (const ing of ingredients) {
    if (ing.food?.portion === '1 gram') total += Number(ing.portions) || 0;
    else unweighed += 1;
  }
  if (total <= 0) return null;
  return { perServing: total / (servings || 1), total, unweighed };
}

const grams = (n: number) => `${Math.round(n).toLocaleString('en-GB')} g`;

// "278 g a serving (1,390 g in all)", and when some ingredients are counted by the portion, "… plus 2 items counted, not weighed".
export function recipeServingText(weight: RecipeServingWeight): string {
  const base = `${grams(weight.perServing)} a serving (${grams(weight.total)} in all)`;
  if (weight.unweighed === 0) return base;
  return `${base}, plus ${weight.unweighed} ${weight.unweighed === 1 ? 'item' : 'items'} counted, not weighed`;
}
