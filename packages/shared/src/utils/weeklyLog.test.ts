import { describe, expect, it } from 'vitest';

import { applyDayPatch, blankDailyLog, datesOfWeek, editableTrackerValue, formatTrackerValue, nudgeValue, parseTrackerInput, shiftWeek, validateDayPatch, weekAverages, weekOffset, weekStartOf } from './weeklyLog';

describe('nudgeValue', () => {
  it('moves by the tracker step and stays inside its range', () => {
    expect(nudgeValue('sleep', 7, 1)).toBe(7.5);
    expect(nudgeValue('sleep', 0, -1)).toBe(0);
    expect(nudgeValue('sleep', 12, 1)).toBe(12);
    expect(nudgeValue('steps', 7800, 1)).toBe(8300);
    expect(nudgeValue('water', 0.5, 1)).toBe(0.75);
    expect(nudgeValue('water', 5, 1)).toBe(5);
  });
  it('starts from zero when nothing is logged', () => {
    expect(nudgeValue('steps', null, 1)).toBe(500);
    expect(nudgeValue('water', null, -1)).toBe(0);
  });
  it('does not drift on repeated fractions', () => {
    let v: number | null = 0;
    for (let i = 0; i < 7; i++) v = nudgeValue('water', v, 1);
    expect(v).toBe(1.75);
  });
});

describe('parseTrackerInput', () => {
  it('reads typed figures', () => {
    expect(parseTrackerInput('sleep', '7.5')).toBe(7.5);
    expect(parseTrackerInput('steps', '8,250')).toBe(8250);
    expect(parseTrackerInput('steps', '8250.6')).toBe(8251);
  });
  it('reads water in millilitres when asked', () => {
    expect(parseTrackerInput('water', '1500', 'mL')).toBe(1.5);
    expect(parseTrackerInput('water', '2.5', 'L')).toBe(2.5);
  });
  it('keeps figures inside the typed limits', () => {
    expect(parseTrackerInput('sleep', '30')).toBe(24);
    expect(parseTrackerInput('steps', '250000')).toBe(100000);
    expect(parseTrackerInput('water', '99')).toBe(10);
  });
  it('ignores empty, negative and non-numbers', () => {
    expect(parseTrackerInput('sleep', '')).toBeNull();
    expect(parseTrackerInput('sleep', '  ')).toBeNull();
    expect(parseTrackerInput('sleep', '-2')).toBeNull();
    expect(parseTrackerInput('sleep', 'abc')).toBeNull();
  });
});

describe('formatting', () => {
  it('shows each tracker as the web does', () => {
    expect(formatTrackerValue('sleep', 7.5)).toBe('7.5');
    expect(formatTrackerValue('steps', 8250)).toBe('8,250');
    expect(formatTrackerValue('water', 1.5)).toBe('1.50');
    expect(formatTrackerValue('water', 1.5, 'mL')).toBe('1500');
  });
  it('gives an editable figure without separators', () => {
    expect(editableTrackerValue('steps', 8250)).toBe('8250');
    expect(editableTrackerValue('water', 1.5, 'mL')).toBe('1500');
    expect(editableTrackerValue('water', 1.5)).toBe('1.5');
  });
});

describe('weeks', () => {
  it('finds the Monday of any date', () => {
    expect(weekStartOf('2026-10-12')).toBe('2026-10-12'); // a Monday
    expect(weekStartOf('2026-10-14')).toBe('2026-10-12');
    expect(weekStartOf('2026-10-18')).toBe('2026-10-12'); // Sunday belongs to the week before it
    expect(weekStartOf('2026-10-19')).toBe('2026-10-19');
  });
  it('lists the seven days', () => {
    expect(datesOfWeek('2026-10-12')).toEqual(['2026-10-12', '2026-10-13', '2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18']);
  });
  it('moves by whole weeks and counts the offset', () => {
    expect(shiftWeek('2026-10-12', -1)).toBe('2026-10-05');
    expect(shiftWeek('2026-10-12', 2)).toBe('2026-10-26');
    expect(weekOffset('2026-10-12', '2026-10-05')).toBe(-1);
    expect(weekOffset('2026-10-12', '2026-09-14')).toBe(-4);
    expect(weekOffset('2026-10-12', '2026-10-12')).toBe(0);
  });
  it('steps across a clock change without losing a day', () => {
    expect(shiftWeek('2026-10-19', -1)).toBe('2026-10-12');
    expect(shiftWeek('2026-10-26', -1)).toBe('2026-10-19');
    expect(datesOfWeek('2026-10-26')[6]).toBe('2026-11-01');
  });
});

describe('weekAverages', () => {
  it('averages each figure over the days that have it', () => {
    const a = weekAverages([
      { calories: null, protein: 100, carbs: 200, fat: 50, steps: 8000, bodyweight: 70 },
      { calories: null, protein: 120, carbs: 180, fat: 60, steps: null, bodyweight: 71 },
      { calories: null, protein: null, carbs: null, fat: null, steps: 6000, bodyweight: null },
    ]);
    expect(a.foodDays).toBe(2);
    expect(a.protein).toBe(110);
    expect(a.carbs).toBe(190);
    expect(a.fat).toBe(55);
    expect(a.steps).toBe(7000);
    expect(a.bodyweight).toBe(70.5);
    // 100*4+200*4+50*9 = 1650 ; 120*4+180*4+60*9 = 1740
    expect(a.calories).toBe(1695);
  });
  it('counts a Quick Add of calories with no macros, and uses the stored day calories (R11)', () => {
    const a = weekAverages([
      { calories: 300, protein: null, carbs: null, fat: null, steps: null, bodyweight: null }, // "300 kcal, no split"
      { calories: null, protein: 100, carbs: 200, fat: 50, steps: null, bodyweight: null }, // an older row: worked out from the macros
    ]);
    expect(a.foodDays).toBe(2);
    expect(a.calories).toBe((300 + 1650) / 2);
  });
  it('is null for a week with nothing', () => {
    const a = weekAverages([{ calories: null, protein: null, carbs: null, fat: null, steps: null, bodyweight: null }]);
    expect(a).toEqual({ foodDays: 0, calories: null, protein: null, carbs: null, fat: null, steps: null, bodyweight: null });
  });
});

describe('validateDayPatch', () => {
  it('accepts values inside the limits', () => {
    expect(validateDayPatch({ sleep: 8, steps: 12000, water: 2.5, bodyweight: 72.4, notes: 'ok', hunger: 3 })).toBeNull();
    expect(validateDayPatch({ sleep: 0, steps: 0, water: 0 })).toBeNull();
  });
  it('refuses figures outside them', () => {
    expect(validateDayPatch({ sleep: 25 })).toMatch(/Sleep/);
    expect(validateDayPatch({ steps: 100001 })).toMatch(/Steps/);
    expect(validateDayPatch({ water: 16 })).toMatch(/Water/);
    expect(validateDayPatch({ bodyweight: 19 })).toMatch(/Bodyweight/);
    expect(validateDayPatch({ bodyweight: 401 })).toMatch(/Bodyweight/);
    expect(validateDayPatch({ notes: 'x'.repeat(1001) })).toMatch(/Notes/);
    expect(validateDayPatch({ stress: 6 })).toMatch(/1 to 5/);
    expect(validateDayPatch({ energy: 0 })).toMatch(/1 to 5/);
  });
});

describe('blankDailyLog and applyDayPatch', () => {
  it('starts empty and takes an edit', () => {
    const blank = blankDailyLog('c1', '2026-10-12');
    expect(blank.client_id).toBe('c1');
    expect(blank.log_date).toBe('2026-10-12');
    expect(blank.steps).toBeNull();
    expect(blank.gym_session).toBe(false);
    expect(blank.day_type).toBe('flat');
    expect(applyDayPatch(blank, { steps: 5000, notes: 'x' })).toMatchObject({ steps: 5000, notes: 'x', sleep: null });
  });
});
