import { describe, expect, it } from 'vitest';
import { dayCaloriesOf, hasFoodLogged, hasLoggedData } from './dailyLog';
import { dayFieldsFromDiary, dayFieldsFromManual, dayFieldsFromPhotos } from './foodTotals';
import type { DailyLogRow } from '@/lib/data/types';

const food = (protein: number, carbs: number, fat: number, portions = 1) => ({ food: { protein, carbs, fat, fibre: 0 }, portions });
const quickAdd = (calories: number | null, protein: number | null = null, carbs: number | null = null, fat: number | null = null) => ({
  food: null,
  portions: 1,
  quick_add_calories: calories,
  quick_add_protein: protein,
  quick_add_carbs: carbs,
  quick_add_fat: fat,
});

// A daily_logs row with nothing on it, then whatever a test sets.
const row = (over: Partial<DailyLogRow> = {}): DailyLogRow => ({
  id: 'l1', client_id: 'c1', log_date: '2026-10-15', protein: null, carbs: null, fat: null, fibre: null, calories: null, water: null, bodyweight: null,
  steps: null, sleep: null, gym_session: false, day_type: 'flat', hunger: null, energy: null, motivation: null, stress: null, period_started: false, notes: null, ...over,
});

describe('the day a diary writes (R11, LT1)', () => {
  it('a Quick Add of 300 kcal with no macros is a 300 kcal day', () => {
    const day = dayFieldsFromDiary([quickAdd(300)]);
    expect(day.calories).toBe(300);
    expect(day.protein).toBe(0);
    expect(dayCaloriesOf(row({ ...day }))).toBe(300);
  });

  it('mixed entries add up: foods from their macros, Quick Adds as entered', () => {
    // 30 g protein + 40 g carbs + 10 g fat = 120 + 160 + 90 = 370 kcal, plus a 300 kcal Quick Add with a rough protein figure.
    const day = dayFieldsFromDiary([food(30, 40, 10), quickAdd(300, 5)]);
    expect(day.calories).toBe(670);
    expect(day.protein).toBe(35);
  });

  it('a Quick Add with macros and no kcal derives its calories from them', () => {
    expect(dayFieldsFromDiary([quickAdd(null, 10, 20, 5)]).calories).toBe(10 * 4 + 20 * 4 + 5 * 9);
  });

  it('scales a food by its portions', () => {
    expect(dayFieldsFromDiary([food(0.2, 0, 0.1, 100)]).calories).toBe(0.2 * 100 * 4 + 0.1 * 100 * 9);
  });
});

describe('an emptied diary is not a logged day (M2, LT2)', () => {
  it('writes nulls, not zeros, when there are no entries', () => {
    expect(dayFieldsFromDiary([])).toEqual({ protein: null, carbs: null, fat: null, fibre: null, calories: null });
    expect(dayFieldsFromManual([])).toEqual({ protein: null, carbs: null, fat: null, calories: null });
    expect(dayFieldsFromPhotos([])).toEqual({ protein: null, carbs: null, fat: null, calories: null });
  });

  it('so the emptied day has no food and no logged data', () => {
    const emptied = row({ ...dayFieldsFromDiary([]) });
    expect(hasFoodLogged(emptied)).toBe(false);
    expect(hasLoggedData(emptied)).toBe(false);
  });

  it('while a day with real food still counts', () => {
    const real = row({ ...dayFieldsFromDiary([quickAdd(300)]) });
    expect(hasFoodLogged(real)).toBe(true);
    expect(hasLoggedData(real)).toBe(true);
  });

  it('a calories-only day counts as logged even if the macros were never written', () => {
    expect(hasLoggedData(row({ calories: 300 }))).toBe(true);
  });
});

describe('dayCaloriesOf', () => {
  it('uses the stored total when there is one', () => {
    expect(dayCaloriesOf(row({ calories: 300, protein: 0, carbs: 0, fat: 0 }))).toBe(300);
  });

  it('falls back to the macros on rows written before the column existed, exactly as before', () => {
    expect(dayCaloriesOf(row({ protein: 100, carbs: 200, fat: 50 }))).toBe(400 + 800 + 450);
    expect(dayCaloriesOf(row({ protein: 100 }))).toBe(400);
  });

  it('is 0 for a day with nothing on it', () => {
    expect(dayCaloriesOf(row())).toBe(0);
  });
});

describe('typed totals and photo days', () => {
  it('counts a kcal-only typed entry', () => {
    expect(dayFieldsFromManual([{ calories: 400, protein: null, carbs: null, fat: null }]).calories).toBe(400);
  });

  it('sums typed entries, deriving calories where only macros were typed', () => {
    const day = dayFieldsFromManual([
      { calories: 400, protein: null, carbs: null, fat: null },
      { calories: null, protein: 10, carbs: 10, fat: 10 },
    ]);
    expect(day.calories).toBe(400 + 10 * 4 + 10 * 4 + 10 * 9);
    expect(day.protein).toBe(10);
  });

  it('photo days leave calories empty so they are read from the estimated macros', () => {
    const day = dayFieldsFromPhotos([{ estimated_protein: 20, estimated_carbs: 30, estimated_fat: 10 }, { estimated_protein: null, estimated_carbs: null, estimated_fat: null }]);
    expect(day).toEqual({ protein: 20, carbs: 30, fat: 10, calories: null });
    expect(dayCaloriesOf(row({ ...day }))).toBe(80 + 120 + 90);
  });
});
