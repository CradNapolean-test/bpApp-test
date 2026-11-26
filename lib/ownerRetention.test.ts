import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';
import { keptPct, monthLabel, retentionCsv, retentionRows, retentionTotals, type RetentionCohort } from './ownerRetention';

const cohort = (month: string, over: Partial<RetentionCohort> = {}): RetentionCohort => ({
  month,
  joined: 0,
  startedPlan: 0,
  onPlanNow: 0,
  eligible1: 0,
  kept1: 0,
  eligible3: 0,
  kept3: 0,
  eligible6: 0,
  kept6: 0,
  ...over,
});

describe('keptPct', () => {
  it('is the share of the members old enough to count, rounded', () => {
    expect(keptPct(2, 3)).toBe(67);
    expect(keptPct(0, 4)).toBe(0);
  });

  it('is null when nobody has been a member that long yet, never 0%', () => {
    expect(keptPct(0, 0)).toBeNull();
  });

  it('never goes over 100%', () => {
    expect(keptPct(5, 4)).toBe(100);
  });
});

describe('retentionRows', () => {
  it('lists the newest month first with each share', () => {
    const rows = retentionRows([
      cohort('2026-05-01', { joined: 10, startedPlan: 9, onPlanNow: 5, eligible1: 10, kept1: 9, eligible3: 10, kept3: 7, eligible6: 10, kept6: 5 }),
      cohort('2026-11-01', { joined: 4, startedPlan: 2, onPlanNow: 2 }),
    ]);
    expect(rows.map((r) => r.month)).toEqual(['2026-11-01', '2026-05-01']);
    expect(rows[0]).toMatchObject({ label: 'Nov 2026', nowPct: 50, pct1: null, pct3: null, pct6: null });
    expect(rows[1]).toMatchObject({ label: 'May 2026', nowPct: 50, pct1: 90, pct3: 70, pct6: 50 });
  });

  it('gives no share for a month nobody joined in', () => {
    expect(retentionRows([cohort('2026-08-01')])[0]).toMatchObject({ joined: 0, nowPct: null, pct1: null });
  });
});

describe('retentionTotals', () => {
  it('counts each share out of the members old enough for it, not everyone who joined', () => {
    const totals = retentionTotals([
      cohort('2026-05-01', { joined: 10, startedPlan: 9, onPlanNow: 5, eligible1: 10, kept1: 9, eligible3: 10, kept3: 7, eligible6: 10, kept6: 5 }),
      cohort('2026-10-01', { joined: 6, startedPlan: 6, onPlanNow: 6, eligible1: 6, kept1: 6 }),
      cohort('2026-11-01', { joined: 4, startedPlan: 2, onPlanNow: 2 }),
    ]);
    expect(totals).toEqual({ joined: 20, startedPlan: 17, onPlanNow: 13, nowPct: 65, pct1: 94, pct3: 70, pct6: 50 });
  });
});

describe('retentionCsv', () => {
  it('has a row per month with "share (kept of eligible)", blank before a month is old enough', () => {
    const csv = retentionCsv([cohort('2026-09-01', { joined: 3, startedPlan: 3, onPlanNow: 2, eligible1: 3, kept1: 3, eligible3: 1, kept3: 1 })]);
    const lines = toCsv(csv.headers, csv.rows).split(/\r?\n/);
    expect(lines[0]).toBe('Month joined,Joined,Started a plan,On a plan now,On a plan after 1 month,On a plan after 3 months,On a plan after 6 months');
    expect(lines[1]).toBe('2026-09,3,3,2,100% (3 of 3),100% (1 of 1),');
  });

  it('labels months in words', () => {
    expect(monthLabel('2026-01-01')).toBe('Jan 2026');
  });
});
