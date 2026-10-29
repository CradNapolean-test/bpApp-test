import { describe, expect, it } from 'vitest';
import { newPlanRows, planLoggedMessage } from './planLogging';

const row = (food_id: string, portions: number, meal_section_id: string | null = 's1') => ({ food_id, portions, meal_section_id });

describe('newPlanRows (MP1)', () => {
  it('adds everything the first time', () => {
    expect(newPlanRows([row('oats', 50), row('milk', 200)], [])).toHaveLength(2);
  });

  it('adds nothing the second time', () => {
    const plan = [row('oats', 50), row('milk', 200)];
    expect(newPlanRows(plan, plan)).toEqual([]);
  });

  it('adds only what is missing', () => {
    expect(newPlanRows([row('oats', 50), row('milk', 200)], [row('oats', 50)])).toEqual([row('milk', 200)]);
  });

  it('treats the same food in another section or amount as different', () => {
    expect(newPlanRows([row('oats', 50, 's1')], [row('oats', 50, 's2')])).toHaveLength(1);
    expect(newPlanRows([row('oats', 50)], [row('oats', 60)])).toHaveLength(1);
  });

  it('counts one for one when the plan repeats a row', () => {
    expect(newPlanRows([row('egg', 1), row('egg', 1)], [row('egg', 1)])).toEqual([row('egg', 1)]);
  });

  it('is not thrown by tiny rounding differences in portions', () => {
    expect(newPlanRows([row('oats', 33.3333333)], [row('oats', 33.333)])).toEqual([]);
  });

  describe('Quick Adds', () => {
    const quick = (name: string, calories: number | null, section: string | null = 's1') => ({
      food_id: null,
      portions: 1,
      meal_section_id: section,
      quick_add_name: name,
      quick_add_calories: calories,
      quick_add_protein: null,
      quick_add_carbs: null,
      quick_add_fat: null,
    });

    it('treats a different Quick Add as a different row', () => {
      expect(newPlanRows([quick('Burrito', 700)], [quick('Latte', 150)])).toEqual([quick('Burrito', 700)]);
      expect(newPlanRows([quick('Burrito', 700)], [quick('Burrito', 650)])).toEqual([quick('Burrito', 700)]);
    });

    it('skips a Quick Add that is already there', () => {
      expect(newPlanRows([quick('Burrito', 700)], [quick('Burrito', 700)])).toEqual([]);
    });

    it('does not mistake a Quick Add for a food', () => {
      expect(newPlanRows([quick('Burrito', 700)], [row('oats', 1)])).toHaveLength(1);
    });
  });
});

describe('planLoggedMessage', () => {
  it('says so when everything was already there', () => {
    expect(planLoggedMessage(0, 3, 'Plan')).toBe("Plan is already in today's diary.");
    expect(planLoggedMessage(0, 2, 'Lunch')).toBe("Lunch is already in today's diary.");
  });
  it('says how many were added when some were already there', () => {
    expect(planLoggedMessage(1, 3, 'Plan')).toBe("1 of 3 added to today's diary. The rest were already there.");
  });
  it('is the usual message otherwise', () => {
    expect(planLoggedMessage(3, 3, 'Plan')).toBe("Plan added to today's diary");
    expect(planLoggedMessage(2, 2, 'Lunch')).toBe("Lunch added to today's diary");
  });
});
