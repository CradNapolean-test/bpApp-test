// "Add the whole plan / section to today's diary" (MP1). Tapping it twice used to add every entry twice. The entries that are already in
// the day's diary (the same food, in the same section, in the same amount) are skipped, so a second tap adds nothing and says so.
// Counted one for one: a plan with two identical rows, and a diary with one of them, adds the other.

// A Quick Add has no food, so it is told apart by its name and figures: two different Quick Adds are never "the same row" (copying a day
// with a "Restaurant dinner" in it must not skip it because another Quick Add is already there).
export interface DiaryRowKey {
  food_id: string | null;
  portions: number;
  meal_section_id: string | null;
  quick_add_name?: string | null;
  quick_add_calories?: number | null;
  quick_add_protein?: number | null;
  quick_add_carbs?: number | null;
  quick_add_fat?: number | null;
}

const rounded = (n: number | null | undefined) => (n == null ? '' : String(Math.round(n * 1000) / 1000));

const keyOf = (row: DiaryRowKey) =>
  [
    row.food_id ?? '',
    row.meal_section_id ?? '',
    rounded(row.portions),
    row.quick_add_name ?? '',
    rounded(row.quick_add_calories),
    rounded(row.quick_add_protein),
    rounded(row.quick_add_carbs),
    rounded(row.quick_add_fat),
  ].join('|');

export function newPlanRows<T extends DiaryRowKey>(planned: T[], existing: DiaryRowKey[]): T[] {
  const have = new Map<string, number>();
  for (const row of existing) have.set(keyOf(row), (have.get(keyOf(row)) ?? 0) + 1);
  const toAdd: T[] = [];
  for (const row of planned) {
    const key = keyOf(row);
    const left = have.get(key) ?? 0;
    if (left > 0) have.set(key, left - 1);
    else toAdd.push(row);
  }
  return toAdd;
}

export function planLoggedMessage(added: number, planned: number, label: string): string {
  if (planned > 0 && added === 0) return `${label} is already in today's diary.`;
  if (added < planned) return `${added} of ${planned} added to today's diary. The rest were already there.`;
  return label === 'Plan' ? "Plan added to today's diary" : `${label} added to today's diary`;
}
