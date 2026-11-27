import { describe, expect, it } from 'vitest';
import { nutritionText, weekNutrition } from './memberNutrition';
import { weeklyTarget } from './calculations';
import { averageDayTarget } from './utils/dayTarget';
import { toEngineProfile } from './utils/clientProfile';
import type { ClientProfileRow } from './data/types';

// Thursday 26 Nov 2026: the week started on Monday 23rd, so Mon-Wed are the days counted (today is still going).
const today = '2026-11-26';
const typed = { nutrition_tracking_mode: 'full_tracking', custom_calories: 1900, custom_protein: 140, custom_carbs: 200, custom_fat: 60 } as const;
const log = (log_date: string, calories: number | null) => ({ log_date, calories, protein: null, carbs: null, fat: null });

describe("the Members list's food column (NU30)", () => {
  it("averages this week's full days before today against the day's target", () => {
    const n = weekNutrition(typed, [log('2026-11-23', 1800), log('2026-11-24', 2000), log('2026-11-25', 1900)], null, today);
    expect(n).toEqual({ method: 'full_tracking', avg: 1900, target: 1900, fullDays: 3, completedDays: 3, tone: 'green' });
    expect(nutritionText(n)).toEqual({ main: '1,900 / 1,900 kcal', detail: 'Full tracking · 3 of 3 days' });
  });

  it("leaves out today, last week, days with no food and a shake-only day (the Overview's rule)", () => {
    const n = weekNutrition(
      typed,
      [log('2026-11-26', 3000), log('2026-11-22', 500), log('2026-11-23', 2100), log('2026-11-24', 300), log('2026-11-25', null)],
      null,
      today
    );
    expect(n.avg).toBe(2100);
    expect(n.fullDays).toBe(1);
    expect(nutritionText(n).detail).toBe('Full tracking · 1 of 3 days');
  });

  it('colours the average by how far it is from the target', () => {
    expect(weekNutrition(typed, [log('2026-11-23', 2200)], null, today).tone).toBe('amber');
    expect(weekNutrition(typed, [log('2026-11-23', 1000)], null, today).tone).toBe('red');
  });

  it("uses the member's real target: calculations.ts at their programme week, the planned average day when cycling", () => {
    const profile = {
      nutrition_tracking_mode: 'manual_import',
      age: 40,
      gender: 'Female',
      start_weight: 80,
      goal_weight: 70,
      body_fat_pct: 30,
      activity_level: 1.4,
      diet_approach: 'High Carb Low Fat',
      nutrition_goal: 'fat_loss',
      nutrition_setting: 'steady',
      cycling: true,
      join_date: '2026-10-05',
    } as Partial<ClientProfileRow>;
    // Joined Mon 5 Oct: Thu 26 Nov is in week 8.
    const expected = Math.round(averageDayTarget(weeklyTarget(toEngineProfile(profile as ClientProfileRow)!, 8))!.calories);
    const n = weekNutrition(profile, [log('2026-11-23', expected)], null, today);
    expect(n.target).toBe(expected);
    expect(n.method).toBe('manual_import');
    expect(nutritionText(n).detail).toBe('Typed totals · 1 of 3 days');
  });

  it('says so when there is nothing to average yet', () => {
    // Monday: the first full day counts from tomorrow.
    expect(nutritionText(weekNutrition(typed, [], null, '2026-11-23'))).toEqual({ main: '— / 1,900 kcal', detail: 'Full tracking · from tomorrow' });
    expect(nutritionText(weekNutrition({ nutrition_tracking_mode: 'photo_diary' }, [], null, today))).toEqual({
      main: '—',
      detail: 'Photo diary · photos, no calories',
    });
    expect(weekNutrition(null, [], null, today).target).toBeNull();
    expect(nutritionText(null)).toEqual({ main: '—', detail: '' });
  });
});
