// Sensible ceilings for the numbers typed on the food screens (FT9, FS3, FS6). The number boxes had no minimum or maximum, so "0.5 kg of
// chicken" typed as 500000 grams was accepted and added a day of 2 million calories. The database limits (migration 0114) stay as the
// backstop; these are what the screen tells the member before it gets that far.

export const FOOD_LIMITS = {
  // One entry's calories (a Quick Add, a typed-totals entry).
  kcal: 5000,
  // One entry's protein, carbs or fat, and a food's quantity when it is measured in grams.
  grams: 2000,
  // A food measured in portions ("2 x 1 egg"), and a recipe's servings eaten.
  portions: 50,
} as const;

export type FoodField = keyof typeof FOOD_LIMITS;

const LABEL: Record<FoodField, string> = { kcal: 'Calories', grams: 'Grams', portions: 'Portions' };

// null when the text is fine (or empty and blank is allowed); otherwise what to tell the member.
export function checkFoodNumber(text: string | number | null | undefined, field: FoodField, options: { allowBlank?: boolean } = {}): string | null {
  const raw = typeof text === 'number' ? String(text) : (text ?? '').trim();
  if (raw === '') return options.allowBlank ? null : `Enter the ${LABEL[field].toLowerCase()}.`;
  const value = Number(raw);
  if (!Number.isFinite(value)) return `${LABEL[field]} must be a number.`;
  if (value < 0) return `${LABEL[field]} cannot be negative.`;
  if (value > FOOD_LIMITS[field]) return `${LABEL[field]} can be at most ${FOOD_LIMITS[field].toLocaleString('en-GB')}.`;
  return null;
}

// The first problem among several fields, for a form with an Add button.
export function firstFoodProblem(checks: (string | null)[]): string | null {
  return checks.find((c) => c != null) ?? null;
}
