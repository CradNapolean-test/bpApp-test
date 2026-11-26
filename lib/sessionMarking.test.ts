import { describe, expect, it } from 'vitest';
import { rememberCount, unmarkedInRoster, withMarkedCounts } from './sessionMarking';
import { lastWeightsOrder } from './lastWeightsOrder';
import { isRunClassDate, runClassTimeZone } from '@/app/coach/run/[classId]/[date]/runClassPage';

const occ = (classId: string, date: string, unmarkedCount = 0) => ({ classId, date, unmarkedCount });

describe('unmarkedInRoster (BK20)', () => {
  it('counts booked places with no mark, never the waitlist or cancelled ones', () => {
    expect(
      unmarkedInRoster([
        { status: 'booked', attended: false, noShow: false },
        { status: 'booked', attended: true, noShow: false },
        { status: 'booked', attended: false, noShow: true },
        { status: 'waitlist', attended: false, noShow: false },
        { status: 'cancelled', attended: false, noShow: false },
      ])
    ).toBe(1);
  });
});

describe('withMarkedCounts (BK20)', () => {
  const page = [occ('a', '2026-11-20', 3), occ('b', '2026-11-21', 1)];

  it('leaves the page alone when nothing has been marked', () => {
    expect(withMarkedCounts(page, null, null)).toBe(page);
  });

  it("uses the open session's live count at once", () => {
    const shown = withMarkedCounts(page, null, { key: 'a|2026-11-20', count: 0 });
    expect(shown.map((o) => o.unmarkedCount)).toEqual([0, 1]);
    // So the banner's "sessions need marking" drops from 2 to 1 without a reload.
    expect(shown.filter((o) => o.unmarkedCount > 0)).toHaveLength(1);
  });

  it('remembers a count after the session closes, on the same page', () => {
    const remembered = rememberCount(null, page, 'b|2026-11-21', 0);
    const again = rememberCount(remembered, page, 'a|2026-11-20', 2);
    expect(withMarkedCounts(page, again, null).map((o) => o.unmarkedCount)).toEqual([2, 0]);
  });

  it("drops what it remembered once the page's own numbers are read again", () => {
    const remembered = rememberCount(null, page, 'a|2026-11-20', 0);
    const fresh = [occ('a', '2026-11-20', 0), occ('b', '2026-11-21', 1)];
    expect(withMarkedCounts(fresh, remembered, null)).toBe(fresh);
    expect(rememberCount(remembered, fresh, 'b|2026-11-21', 0).counts).toEqual({ 'b|2026-11-21': 0 });
  });

  it('lets the live count win over a remembered one for the same session', () => {
    const remembered = rememberCount(null, page, 'a|2026-11-20', 0);
    expect(withMarkedCounts(page, remembered, { key: 'a|2026-11-20', count: 2 })[0].unmarkedCount).toBe(2);
  });
});

describe('lastWeightsOrder (CS22)', () => {
  it('puts the main lifts first and the warm-ups last, keeping the order within each section', () => {
    const rows = [
      { name: 'Bike', section: 'warmup' as const },
      { name: 'Band pull-apart', section: 'warmup' as const },
      { name: 'Back squat', section: 'lift' as const },
      { name: 'Row', section: 'conditioning' as const },
      { name: 'DB press', section: 'strong' as const },
      { name: 'RDL', section: 'lift' as const },
      { name: 'Untitled', section: null },
    ];
    expect(lastWeightsOrder(rows).map((r) => r.name)).toEqual(['Back squat', 'RDL', 'Untitled', 'DB press', 'Row', 'Bike', 'Band pull-apart']);
  });

  it('does not change the list it was given', () => {
    const rows = [{ section: 'warmup' as const }, { section: 'lift' as const }];
    lastWeightsOrder(rows);
    expect(rows[0].section).toBe('warmup');
  });
});

describe('isRunClassDate (SE15)', () => {
  it('takes a real date', () => {
    expect(isRunClassDate('2026-11-26')).toBe(true);
    expect(isRunClassDate('2028-02-29')).toBe(true);
  });

  it('refuses a mistyped or impossible date', () => {
    for (const bad of ['2026-11-2', '26-11-2026', '2026-13-01', '2026-02-31', '2027-02-29', 'today', '']) {
      expect(isRunClassDate(bad)).toBe(false);
    }
  });
});

describe('runClassTimeZone (CS19)', () => {
  function reader(rows: Record<string, unknown>) {
    return {
      from: (table: string) => ({
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) }) }),
      }),
    };
  }

  it("answers the class's gym's own time zone", async () => {
    await expect(runClassTimeZone(reader({ classes: { gym_id: 'g' }, gyms: { timezone: 'America/New_York' } }), 'c')).resolves.toBe('America/New_York');
  });

  it('answers null when the gym or its zone is not known, so the screen falls back to London', async () => {
    await expect(runClassTimeZone(reader({}), 'c')).resolves.toBeNull();
    await expect(runClassTimeZone(reader({ classes: { gym_id: 'g' }, gyms: { timezone: '' } }), 'c')).resolves.toBeNull();
  });
});
