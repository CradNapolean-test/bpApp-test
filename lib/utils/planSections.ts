import type { MealPlanSection } from '@/lib/data/types';

// The Meal Planner uses the member's own diary sections (NU12): the meals their coach set up, in the diary's order. It used to have six
// fixed meals (three of them snacks) while the diary used the coach's sections, so copying a plan to the diary put food in the wrong
// meal, or all of it under "Other" for a member whose only section was "meal 1". A planned item now belongs to one of the member's
// sections (meal_plan_entries.meal_section_id, migration 0169) and is copied into that same section.
//
// Items planned before then were in one of the six fixed meals. Migration 0169 moved them into the member's sections with the rule below,
// and the screens apply the same rule to any item still without a section (a member who had no sections yet, or whose section was
// deleted): a section with the meal's own name ("Mid-Morning Snack"), else the diary section the meal used to be copied into ("Snacks"),
// else the section at the same point in the day (with sections "meal 1" to "meal 3": breakfast and mid-morning snack go into meal 1,
// lunch and afternoon snack into meal 2, dinner and evening snack into meal 3). No sections at all: "Other" (null).
// Twin of packages/shared/src/utils/planSections.ts (the phone app): keep the two the same. The SQL in migration 0169 is the same rule.

export const LEGACY_PLAN_SLOTS: { key: MealPlanSection; label: string; diaryLabel: string }[] = [
  { key: 'breakfast', label: 'Breakfast', diaryLabel: 'Breakfast' },
  { key: 'mid_morning_snack', label: 'Mid-Morning Snack', diaryLabel: 'Snacks' },
  { key: 'lunch', label: 'Lunch', diaryLabel: 'Lunch' },
  { key: 'afternoon_snack', label: 'Afternoon Snack', diaryLabel: 'Snacks' },
  { key: 'dinner', label: 'Dinner', diaryLabel: 'Dinner' },
  { key: 'evening_snack', label: 'Evening Snack', diaryLabel: 'Snacks' },
];

type Section = { id: string; label: string; sort_order?: number | null; created_at?: string | null };

// The diary's order: sort_order, then when the section was made, then its id (the order migration 0169 uses).
export function orderedSections<S extends Section>(sections: S[]): S[] {
  return [...sections].sort(
    (a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      (a.created_at ?? '').localeCompare(b.created_at ?? '') ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
  );
}

const norm = (text: string) => text.trim().toLowerCase();

// Which of the member's sections one of the six old fixed meals belongs in.
export function legacySlotSectionId(slot: MealPlanSection, sections: Section[]): string | null {
  const index = LEGACY_PLAN_SLOTS.findIndex((s) => s.key === slot);
  if (index < 0 || sections.length === 0) return null;
  const ordered = orderedSections(sections);
  const { label, diaryLabel } = LEGACY_PLAN_SLOTS[index];
  const named = (name: string) => ordered.find((s) => norm(s.label) === norm(name));
  return (named(label) ?? named(diaryLabel) ?? ordered[Math.floor((index * ordered.length) / LEGACY_PLAN_SLOTS.length)]).id;
}

// The section a planned item is shown in and copied into: its own when that is one of the member's sections, else (an item planned in
// one of the old fixed meals) the rule above. Null means "Other".
export function planEntrySectionId(
  entry: { meal_section_id?: string | null; section?: MealPlanSection | null },
  sections: Section[],
): string | null {
  if (entry.meal_section_id && sections.some((s) => s.id === entry.meal_section_id)) return entry.meal_section_id;
  if (entry.section) return legacySlotSectionId(entry.section, sections);
  return null;
}

// "Add Lunch to today's diary": one section's planned items (null = the "Other" ones), or the whole plan.
export type PlanPick = 'all' | { sectionId: string | null };

export function plannedFor<E extends { meal_section_id?: string | null; section?: MealPlanSection | null }>(
  entries: E[],
  which: PlanPick,
  sections: Section[],
): { entry: E; sectionId: string | null }[] {
  return entries
    .map((entry) => ({ entry, sectionId: planEntrySectionId(entry, sections) }))
    .filter((p) => which === 'all' || p.sectionId === which.sectionId);
}
