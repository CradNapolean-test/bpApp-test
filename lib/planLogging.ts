// "Add the whole plan / section to today's diary" (MP1). Tapping it twice used to add every entry twice. The entries that are already in
// the day's diary (the same food, in the same section, in the same amount) are skipped, so a second tap adds nothing and says so.
// Counted one for one: a plan with two identical rows, and a diary with one of them, adds the other.

export interface DiaryRowKey {
  food_id: string | null;
  portions: number;
  meal_section_id: string | null;
}

const keyOf = (row: DiaryRowKey) => `${row.food_id ?? ''}|${row.meal_section_id ?? ''}|${Math.round(row.portions * 1000) / 1000}`;

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
