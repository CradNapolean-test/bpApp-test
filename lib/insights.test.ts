import { describe, expect, it } from 'vitest';
import { NEEDS_MORE_DATA, trustworthyAdaptiveTdee } from './insights';
import type { ClientProfileRow, DailyLogRow } from './data/types';

const profile = {
  age: 35, gender: 'Female', start_weight: 80, goal_weight: 70, body_fat_pct: 32, activity_level: 1.5, diet_approach: 'High Carb Low Fat',
  nutrition_goal: 'fat_loss', nutrition_setting: 'steady', cycling: false,
} as unknown as ClientProfileRow;

const day = (log_date: string, over: Partial<DailyLogRow> = {}): DailyLogRow => ({
  id: log_date, client_id: 'c1', log_date, protein: null, carbs: null, fat: null, fibre: null, calories: null, water: null, bodyweight: null,
  steps: null, sleep: null, gym_session: false, day_type: 'flat', hunger: null, energy: null, motivation: null, stress: null, period_started: false,
  notes: null, ...over,
});
const iso = (n: number) => new Date(Date.UTC(2026, 9, 1 + n)).toISOString().slice(0, 10); // 1 Oct 2026 + n days
// A day of food worth about 2,000 kcal: 150 protein, 200 carbs, 66 fat.
const eats = (n: number, over: Partial<DailyLogRow> = {}) => day(iso(n), { protein: 150, carbs: 200, fat: 66, ...over });

describe('trustworthyAdaptiveTdee (R19)', () => {
  it('refuses the audit\'s failing case: five food days and two weigh-ins a day or two apart', () => {
    const logs = [eats(0, { bodyweight: 80.0 }), eats(1), eats(2), eats(3, { bodyweight: 78.9 }), eats(4)];
    const result = trustworthyAdaptiveTdee(logs, profile, iso(4));
    expect(result).toEqual({ status: 'not_enough', reason: NEEDS_MORE_DATA });
  });

  it('refuses plenty of food days when the weigh-ins are less than two weeks apart', () => {
    const logs = Array.from({ length: 12 }, (_, i) => eats(i, i === 0 ? { bodyweight: 80 } : i === 11 ? { bodyweight: 79.5 } : {}));
    expect(trustworthyAdaptiveTdee(logs, profile, iso(11)).status).toBe('not_enough');
  });

  it('refuses two weeks of weigh-ins when there is not enough food logged', () => {
    const logs = [eats(0, { bodyweight: 80 }), eats(3), eats(6), eats(9), eats(15, { bodyweight: 79.2 })];
    expect(trustworthyAdaptiveTdee(logs, profile, iso(15)).status).toBe('not_enough');
  });

  it('works once there are 10 food days and weigh-ins 14 or more days apart', () => {
    const logs = Array.from({ length: 16 }, (_, i) => eats(i, i === 0 ? { bodyweight: 80 } : i === 15 ? { bodyweight: 79 } : {}));
    const result = trustworthyAdaptiveTdee(logs, profile, iso(15));
    expect(result.status).toBe('ok');
    if (result.status === 'ok') {
      // 2,000 kcal a day eaten, 1 kg lost over 15 days: 7,700 / 15 = about 513 kcal a day of deficit, so maintenance is about 2,513.
      expect(result.adaptiveTdee).toBeGreaterThan(2400);
      expect(result.adaptiveTdee).toBeLessThan(2600);
      expect(result.formulaTdee).toBeGreaterThan(0);
    }
  });

  it('does not count days with no food, or days whose food was all deleted, as food days', () => {
    const empty = (n: number) => day(iso(n), { protein: null, carbs: null, fat: null, calories: null });
    const zero = (n: number) => day(iso(n), { protein: 0, carbs: 0, fat: 0, calories: 0 });
    const logs = [
      eats(0, { bodyweight: 80 }),
      ...Array.from({ length: 5 }, (_, i) => eats(i + 1)),
      ...Array.from({ length: 5 }, (_, i) => empty(i + 6)),
      ...Array.from({ length: 5 }, (_, i) => zero(i + 11)),
      eats(16, { bodyweight: 79 }),
    ];
    // 7 real food days of the 17: under 10.
    expect(trustworthyAdaptiveTdee(logs, profile, iso(16)).status).toBe('not_enough');
  });

  it('counts a kcal-only Quick Add day (calories with no macros) as food', () => {
    const quick = (n: number, over: Partial<DailyLogRow> = {}) => day(iso(n), { protein: 0, carbs: 0, fat: 0, calories: 2000, ...over });
    const logs = Array.from({ length: 16 }, (_, i) => quick(i, i === 0 ? { bodyweight: 80 } : i === 15 ? { bodyweight: 79 } : {}));
    expect(trustworthyAdaptiveTdee(logs, profile, iso(15)).status).toBe('ok');
  });

  it('refuses an answer outside 1,000 to 6,000 kcal', () => {
    // Eating 2,000 a day and "losing" 12 kg in 15 days would make maintenance ~8,000: not believable.
    const logs = Array.from({ length: 16 }, (_, i) => eats(i, i === 0 ? { bodyweight: 90 } : i === 15 ? { bodyweight: 78 } : {}));
    const result = trustworthyAdaptiveTdee(logs, profile, iso(15));
    expect(result.status).toBe('not_enough');
    // And gaining so much that maintenance is negative.
    const gain = Array.from({ length: 16 }, (_, i) => eats(i, i === 0 ? { bodyweight: 70 } : i === 15 ? { bodyweight: 85 } : {}));
    expect(trustworthyAdaptiveTdee(gain, profile, iso(15)).status).toBe('not_enough');
  });

  it('ignores logs older than the 28-day window', () => {
    const old = Array.from({ length: 16 }, (_, i) => eats(i, i === 0 ? { bodyweight: 80 } : i === 15 ? { bodyweight: 79 } : {}));
    expect(trustworthyAdaptiveTdee(old, profile, iso(60)).status).toBe('not_enough');
  });

  it('needs the age and body fat the engine works from', () => {
    const logs = Array.from({ length: 16 }, (_, i) => eats(i, i === 0 ? { bodyweight: 80 } : i === 15 ? { bodyweight: 79 } : {}));
    expect(trustworthyAdaptiveTdee(logs, { ...profile, body_fat_pct: null }, iso(15)).status).toBe('not_enough');
    expect(trustworthyAdaptiveTdee(logs, null, iso(15)).status).toBe('not_enough');
  });
});
