import { describe, expect, it } from 'vitest';
import type { DailyLogRow } from '../data/types';
import { currentStreak, programWeekFromLogs, showsStreak } from './streak';

const log = (log_date: string, patch: Partial<DailyLogRow> = {}): DailyLogRow => ({
  id: log_date, client_id: 'c', log_date,
  protein: null, carbs: null, fat: null, fibre: null, water: null, bodyweight: null, steps: null, sleep: null,
  gym_session: false, day_type: 'flat', hunger: null, energy: null, motivation: null, stress: null,
  period_started: false, notes: null, calories: null, ...patch,
});

describe('currentStreak', () => {
  it('counts consecutive logged days back from today', () => {
    const logs = [log('2026-10-10', { steps: 5000 }), log('2026-10-11', { water: 2 }), log('2026-10-12', { sleep: 7 })];
    expect(currentStreak(logs, '2026-10-12')).toBe(3);
  });

  it('counts from yesterday while today has nothing logged yet (the day has not finished)', () => {
    expect(currentStreak([log('2026-10-10', { steps: 5000 }), log('2026-10-11', { steps: 5000 })], '2026-10-12')).toBe(2);
  });

  it('is 0 when neither today nor yesterday is logged', () => {
    expect(currentStreak([log('2026-10-10', { steps: 5000 })], '2026-10-12')).toBe(0);
  });

  it('ignores a blank row created only to attach food diary entries', () => {
    expect(currentStreak([log('2026-10-11', { steps: 5000 }), log('2026-10-12')], '2026-10-12')).toBe(1);
    expect(currentStreak([log('2026-10-12')], '2026-10-12')).toBe(0);
  });

  it('can run past 85 days when given the history', () => {
    const logs = Array.from({ length: 120 }, (_, i) => log(new Date(Date.UTC(2026, 9, 12) - i * 86_400_000).toISOString().slice(0, 10), { steps: 1 }));
    expect(currentStreak(logs, '2026-10-12')).toBe(120);
  });

  it('stops at the first gap', () => {
    const logs = [log('2026-10-08', { steps: 1 }), log('2026-10-10', { steps: 1 }), log('2026-10-11', { steps: 1 }), log('2026-10-12', { steps: 1 })];
    expect(currentStreak(logs, '2026-10-12')).toBe(3);
  });

  it('crosses a month boundary', () => {
    const logs = [log('2026-09-30', { steps: 1 }), log('2026-10-01', { steps: 1 })];
    expect(currentStreak(logs, '2026-10-01')).toBe(2);
  });
});

describe('programWeekFromLogs', () => {
  it('is week 1 with no logs', () => {
    expect(programWeekFromLogs([], '2026-10-12')).toBe(1);
  });
  it('is week 1 on the first day and for the first 6 days', () => {
    expect(programWeekFromLogs([{ log_date: '2026-10-12' }], '2026-10-12')).toBe(1);
    expect(programWeekFromLogs([{ log_date: '2026-10-06' }], '2026-10-12')).toBe(1);
  });
  it('moves to week 2 after 7 days and week 12 after 77', () => {
    expect(programWeekFromLogs([{ log_date: '2026-10-05' }], '2026-10-12')).toBe(2);
    expect(programWeekFromLogs([{ log_date: '2026-07-27' }], '2026-10-12')).toBe(12);
  });
});

describe('showsStreak', () => {
  const plan = (duration_weeks: number | null | undefined) => ({ package: { duration_weeks } as never });
  it('shows the card for a challenge plan (a set length)', () => {
    expect(showsStreak(plan(6))).toBe(true);
  });
  it('hides it for an ongoing plan with no length', () => {
    expect(showsStreak(plan(null))).toBe(false);
    expect(showsStreak(plan(undefined))).toBe(false);
    expect(showsStreak(plan(0))).toBe(false);
  });
  it('keeps the card when the member has no plan at all', () => {
    expect(showsStreak(null)).toBe(true);
    expect(showsStreak({ package: null })).toBe(true);
  });
});
