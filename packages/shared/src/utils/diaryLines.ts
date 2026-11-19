// A recipe in the food diary is one line that opens to show its ingredients (D23c, NU17). Logging "Protein oats" used to add five lines,
// one per ingredient, so neither the member nor the coach could see "had the oats" at a glance. The ingredients are still saved as
// ordinary diary rows (so the day's totals, the weekly log and the coach's numbers add up exactly as before); the rows of one logging
// share a recipe_log_id and carry the recipe's name and the servings eaten (migration 0169), and the screens show them as one line.
// Rows logged before this (no recipe_log_id) stay separate lines. Twin of lib/utils/diaryLines.ts (the web): keep the two the same.

export interface RecipeLinkFields {
  recipe_log_id?: string | null;
  recipe_name?: string | null;
  recipe_servings?: number | null;
}

export type RecipeLine<T> = { kind: 'recipe'; id: string; name: string; servings: number | null; entries: T[] };
export type DiaryLine<T> = { kind: 'entry'; entry: T } | RecipeLine<T>;

// The database allows a recipe name of 1 to 100 characters on a diary row, as on the recipe itself.
const NAME_MAX = 100;

// The day's (or a meal's) rows as the lines to show, in the order given: a recipe sits where its first ingredient was.
export function diaryLines<T extends RecipeLinkFields>(entries: T[]): DiaryLine<T>[] {
  const lines: DiaryLine<T>[] = [];
  const recipes = new Map<string, RecipeLine<T>>();
  for (const entry of entries) {
    const id = entry.recipe_log_id;
    if (!id) {
      lines.push({ kind: 'entry', entry });
      continue;
    }
    const existing = recipes.get(id);
    if (existing) {
      existing.entries.push(entry);
      continue;
    }
    const line: RecipeLine<T> = { kind: 'recipe', id, name: entry.recipe_name?.trim() || 'Recipe', servings: entry.recipe_servings ?? null, entries: [entry] };
    recipes.set(id, line);
    lines.push(line);
  }
  return lines;
}

// What every row of one logging of a recipe carries.
export function recipeLogFields(recipeLogId: string, name: string, servings: number): Required<RecipeLinkFields> {
  return { recipe_log_id: recipeLogId, recipe_name: (name.trim() || 'Recipe').slice(0, NAME_MAX), recipe_servings: servings };
}

// "File under" for a row sitting in "Other". An ingredient of a logged recipe takes the rest of its recipe with it (every row of that
// logging still in "Other"), so the recipe stays one line in one meal and "Remove" takes off exactly the ingredients it shows.
export function fileUnderLabel(entry: RecipeLinkFields): string {
  return entry.recipe_log_id ? `File all of ${entry.recipe_name?.trim() || 'this recipe'} under` : 'File under';
}

// The day's rows after `target` is filed under `sectionId`, by the rule above.
export function refiledEntries<T extends RecipeLinkFields & { id: string; meal_section_id: string | null }>(
  entries: T[],
  target: { id: string; recipe_log_id?: string | null },
  sectionId: string | null
): T[] {
  const recipe = target.recipe_log_id;
  return entries.map((e) =>
    e.id === target.id || (recipe && e.recipe_log_id === recipe && e.meal_section_id === null) ? { ...e, meal_section_id: sectionId } : e
  );
}

// How many rows "Remove" takes off for a logged recipe: every row of that logging on the day, wherever it is filed.
export const recipeRowCount = (entries: RecipeLinkFields[], recipeLogId: string) => entries.filter((e) => e.recipe_log_id === recipeLogId).length;

// Copying a day or a meal: each recipe on it lands as a new recipe line of its own (a new id), still one line.
export function relinkRecipeCopies<T extends RecipeLinkFields>(rows: T[], newId: () => string): T[] {
  const ids = new Map<string, string>();
  return rows.map((row) => {
    if (!row.recipe_log_id) return row;
    let id = ids.get(row.recipe_log_id);
    if (!id) {
      id = newId();
      ids.set(row.recipe_log_id, id);
    }
    return { ...row, recipe_log_id: id };
  });
}

// "1.5 servings · 4 ingredients"
export function recipeLineDetail(servings: number | null, ingredients: number): string {
  const parts: string[] = [];
  if (servings != null && servings > 0) {
    const n = Math.round(servings * 100) / 100;
    parts.push(`${n} ${n === 1 ? 'serving' : 'servings'}`);
  }
  parts.push(`${ingredients} ${ingredients === 1 ? 'ingredient' : 'ingredients'}`);
  return parts.join(' · ');
}
