import { describe, expect, it } from 'vitest';

import { legacySlotSectionId, orderedSections, planEntrySectionId, plannedFor } from './planSections';

// Same cases as lib/utils/planSections.test.ts: the web and the phone must file a planned item in the same meal.
const sections = (...labels: string[]) => labels.map((label, i) => ({ id: `s${i + 1}`, label, sort_order: i, created_at: '2026-01-01T00:00:00Z' }));

describe('legacySlotSectionId (NU12): the six old fixed meals into the member\'s sections', () => {
  it('uses the diary section with the same name, and puts the snacks in "Snacks" as before', () => {
    const s = sections('Breakfast', 'Lunch', 'Dinner', 'Snacks');
    expect(legacySlotSectionId('breakfast', s)).toBe('s1');
    expect(legacySlotSectionId('lunch', s)).toBe('s2');
    expect(legacySlotSectionId('dinner', s)).toBe('s3');
    expect(['mid_morning_snack', 'afternoon_snack', 'evening_snack'].map((k) => legacySlotSectionId(k as 'lunch', s))).toEqual(['s4', 's4', 's4']);
  });

  it('prefers a section with the meal\'s own name, ignoring case and spaces', () => {
    const s = sections('Breakfast', ' mid-morning snack ', 'Lunch', 'Snacks');
    expect(legacySlotSectionId('mid_morning_snack', s)).toBe('s2');
    expect(legacySlotSectionId('afternoon_snack', s)).toBe('s4');
  });

  it('puts everything in the only section of a member who has one ("meal 1"), not in "Other"', () => {
    const s = sections('meal 1');
    expect(['breakfast', 'lunch', 'dinner', 'evening_snack'].map((k) => legacySlotSectionId(k as 'lunch', s))).toEqual(['s1', 's1', 's1', 's1']);
  });

  it('goes by the point in the day when no name matches', () => {
    const s = sections('Meal 1', 'Meal 2', 'Meal 3');
    expect(['breakfast', 'mid_morning_snack', 'lunch', 'afternoon_snack', 'dinner', 'evening_snack'].map((k) => legacySlotSectionId(k as 'lunch', s))).toEqual([
      's1', 's1', 's2', 's2', 's3', 's3',
    ]);
  });

  it('is "Other" (null) for a member with no sections', () => {
    expect(legacySlotSectionId('lunch', [])).toBeNull();
  });

  it('follows the diary order, not the order the sections arrive in', () => {
    const s = [
      { id: 'b', label: 'Second', sort_order: 1, created_at: null },
      { id: 'a', label: 'First', sort_order: 0, created_at: null },
    ];
    expect(orderedSections(s).map((x) => x.id)).toEqual(['a', 'b']);
    expect(legacySlotSectionId('breakfast', s)).toBe('a');
  });
});

describe('planEntrySectionId', () => {
  const s = sections('Breakfast', 'Lunch');
  it('keeps an item in its own section', () => {
    expect(planEntrySectionId({ meal_section_id: 's2', section: 'breakfast' }, s)).toBe('s2');
  });
  it('files an old item, or one whose section is gone, by its old meal', () => {
    expect(planEntrySectionId({ meal_section_id: null, section: 'lunch' }, s)).toBe('s2');
    expect(planEntrySectionId({ meal_section_id: 'deleted', section: 'breakfast' }, s)).toBe('s1');
  });
  it('is "Other" when it has neither', () => {
    expect(planEntrySectionId({ meal_section_id: null, section: null }, s)).toBeNull();
  });
});

describe('plannedFor', () => {
  const s = sections('Breakfast', 'Lunch');
  const entries = [
    { id: 'e1', meal_section_id: 's1', section: null },
    { id: 'e2', meal_section_id: null, section: 'lunch' as const },
    { id: 'e3', meal_section_id: null, section: null },
  ];
  it('picks one section\'s items, the "Other" ones, or all, each with the section it goes into', () => {
    expect(plannedFor(entries, { sectionId: 's2' }, s).map((p) => [p.entry.id, p.sectionId])).toEqual([['e2', 's2']]);
    expect(plannedFor(entries, { sectionId: null }, s).map((p) => p.entry.id)).toEqual(['e3']);
    expect(plannedFor(entries, 'all', s).map((p) => p.sectionId)).toEqual(['s1', 's2', null]);
  });
});
