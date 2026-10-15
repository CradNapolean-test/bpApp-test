import { describe, expect, it, vi } from 'vitest';
import {
  LOAD_FAILED,
  isoWeekday,
  lastTwo,
  maxOf,
  monthSoFarLabel,
  monthToDateChange,
  settle,
  weekSoFar,
  weekSoFarLabel,
  weekdayExtremes,
} from './ownerReport';

// 28 days ending on Wednesday 14 Oct 2026, oldest first: each day's check-ins are given by the function.
function days(end: string, count: number, checkIns: (index: number) => number) {
  const out: { date: string; checkIns: number }[] = [];
  const last = new Date(`${end}T00:00:00Z`).getTime();
  for (let i = 0; i < count; i += 1) {
    out.push({ date: new Date(last - (count - 1 - i) * 86400000).toISOString().slice(0, 10), checkIns: checkIns(i) });
  }
  return out;
}

describe('isoWeekday', () => {
  it('counts Monday as 1 and Sunday as 7', () => {
    expect(isoWeekday('2026-10-12')).toBe(1);
    expect(isoWeekday('2026-10-14')).toBe(3);
    expect(isoWeekday('2026-10-18')).toBe(7);
  });
});

describe('weekSoFarLabel', () => {
  it('says which days have happened', () => {
    expect(weekSoFarLabel(1)).toBe('Mon');
    expect(weekSoFarLabel(3)).toBe('Mon to Wed');
    expect(weekSoFarLabel(7)).toBe('Mon to Sun');
  });
});

describe('weekSoFar (a Monday must not look like a collapse)', () => {
  it('compares Monday to Wednesday with Monday to Wednesday of last week', () => {
    // 10 members and 5 check-ins every day: the two ranges are equal, so 50% against 50%.
    // 14 Oct is a Wednesday: this week is the last 3 entries, the same days last week are 7 entries earlier.
    const perDay = days('2026-10-14', 28, () => 5);
    const result = weekSoFar(perDay, 10);
    expect(result).toMatchObject({ days: 3, label: 'Mon to Wed' });
    expect(result?.thisRate).toBe(50);
    expect(result?.lastRate).toBe(50);
  });

  it('does not use last week\'s busy end of week against a quiet start of this week', () => {
    // Last week: Mon to Wed quiet (1 a day), Thu to Sun busy (9 a day). This week so far: Mon to Wed at 1 a day.
    const perDay = days('2026-10-14', 28, (i) => {
      const fromEnd = 28 - 1 - i; // 0 = today
      if (fromEnd <= 2) return 1; // this Mon to Wed
      if (fromEnd >= 7 && fromEnd <= 9) return 1; // last Mon to Wed
      return 9;
    });
    const result = weekSoFar(perDay, 10);
    expect(result?.thisRate).toBe(10);
    expect(result?.lastRate).toBe(10);
  });

  it('on a Monday compares one day with one day', () => {
    const perDay = days('2026-10-12', 28, (i) => (i === 27 ? 2 : i === 20 ? 4 : 0));
    const result = weekSoFar(perDay, 10);
    expect(result).toMatchObject({ days: 1, label: 'Mon', thisRate: 20, lastRate: 40 });
  });

  it('has nothing to say without members or days', () => {
    expect(weekSoFar([], 10)).toBeNull();
    expect(weekSoFar(days('2026-10-14', 28, () => 1), 0)).toBeNull();
  });

  it('gives no comparison for last week when the data is too short', () => {
    const result = weekSoFar(days('2026-10-14', 4, () => 2), 10);
    expect(result?.days).toBe(3);
    expect(result?.lastRate).toBeNull();
  });
});

describe('monthSoFarLabel and monthToDateChange', () => {
  it('names the days of the month that have happened', () => {
    expect(monthSoFarLabel(1)).toBe('1st');
    expect(monthSoFarLabel(2)).toBe('1st to 2nd');
    expect(monthSoFarLabel(14)).toBe('1st to 14th');
    expect(monthSoFarLabel(21)).toBe('1st to 21st');
    expect(monthSoFarLabel(22)).toBe('1st to 22nd');
    expect(monthSoFarLabel(23)).toBe('1st to 23rd');
    expect(monthSoFarLabel(11)).toBe('1st to 11th');
    expect(monthSoFarLabel(12)).toBe('1st to 12th');
  });

  it('compares with the same days of last month', () => {
    expect(monthToDateChange(30, 20, 14)).toBe('+50% on the same days last month (1st to 14th)');
    expect(monthToDateChange(10, 20, 14)).toBe('-50% on the same days last month (1st to 14th)');
    expect(monthToDateChange(20, 20, 14)).toBe('+0% on the same days last month (1st to 14th)');
  });

  it('says nothing rather than comparing with the whole of last month', () => {
    expect(monthToDateChange(30, undefined, undefined)).toBeNull();
    expect(monthToDateChange(30, null, 14)).toBeNull();
    expect(monthToDateChange(30, 0, 14)).toBeNull();
    expect(monthToDateChange(30, 20, null)).toBeNull();
  });
});

describe('guards for an empty report', () => {
  it('weekdayExtremes finds the best and the quietest day, and survives no data', () => {
    expect(weekdayExtremes([])).toBeNull();
    const result = weekdayExtremes([
      { dow: 1, avgPct: 40 },
      { dow: 2, avgPct: 70 },
      { dow: 3, avgPct: 10 },
    ]);
    expect(result?.best.dow).toBe(2);
    expect(result?.worst.dow).toBe(3);
  });

  it('a single weekday is both best and quietest', () => {
    const result = weekdayExtremes([{ dow: 4, avgPct: 33 }]);
    expect(result?.best.dow).toBe(4);
    expect(result?.worst.dow).toBe(4);
  });

  it('maxOf never returns 0 or -Infinity', () => {
    expect(maxOf([])).toBe(1);
    expect(maxOf([0, 0])).toBe(1);
    expect(maxOf([3, 9, 2])).toBe(9);
  });

  it('lastTwo copes with zero, one and many rows', () => {
    expect(lastTwo([])).toEqual({ current: null, previous: null });
    expect(lastTwo([1])).toEqual({ current: 1, previous: null });
    expect(lastTwo([1, 2, 3])).toEqual({ current: 3, previous: 2 });
  });
});

describe('settle (the loader never leaves the screen on "Loading…")', () => {
  it('passes a result through', async () => {
    expect(await settle(async () => ({ ok: true as const, data: 5 }))).toEqual({ ok: true, data: 5 });
    expect(await settle(async () => ({ ok: false as const, error: 'Nope' }))).toEqual({ ok: false, error: 'Nope' });
  });

  it('turns a thrown error (a dropped connection) into a readable failure and reports the cause', async () => {
    const onError = vi.fn();
    const boom = new Error('fetch failed');
    const result = await settle(async () => {
      throw boom;
    }, onError);
    expect(result).toEqual({ ok: false, error: LOAD_FAILED });
    expect(onError).toHaveBeenCalledWith(boom);
  });

  it('can be run again after a failure and then succeeds', async () => {
    let attempts = 0;
    const load = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('timeout');
      return { ok: true as const, data: 'report' };
    };
    expect((await settle(load)).ok).toBe(false);
    expect(await settle(load)).toEqual({ ok: true, data: 'report' });
    expect(attempts).toBe(2);
  });

  it('never shows setup instructions in its message', () => {
    expect(LOAD_FAILED).not.toMatch(/migration|run /i);
  });
});
