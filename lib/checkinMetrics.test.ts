import { describe, expect, it } from 'vitest';
import { enabledTrackers, toDisabledMetricSet, weekStats } from './checkinMetrics';

describe('toDisabledMetricSet / enabledTrackers', () => {
  it('ignores unknown values and lists the trackers still on', () => {
    const off = toDisabledMetricSet(['steps', 'mood', 'stress']);
    expect([...off].sort()).toEqual(['steps', 'stress']);
    expect(enabledTrackers(off)).toEqual(['sleep', 'water']);
  });
});

describe('weekStats', () => {
  const days = [
    { date: '2026-10-12', values: { sleep: 7, energy: 3, steps: 9000 } },
    { date: '2026-10-13', values: { sleep: 5.5, energy: 5 } },
    { date: '2026-10-14', values: { sleep: 8, energy: null } },
  ];
  it('gives average, low and high (with the day) for each measure that is on', () => {
    const s = weekStats(days, toDisabledMetricSet(['steps', 'water', 'hunger', 'motivation', 'stress']));
    expect(s.map((x) => x.key)).toEqual(['sleep', 'energy']);
    const sleep = s[0];
    expect(sleep.days).toBe(3);
    expect(sleep.avg).toBeCloseTo(6.833, 2);
    expect(sleep.low).toEqual({ value: 5.5, date: '2026-10-13' });
    expect(sleep.high).toEqual({ value: 8, date: '2026-10-14' });
    expect(s[1]).toMatchObject({ days: 2, avg: 4 });
  });
  it('reports a measure with no values as empty rather than zero', () => {
    const s = weekStats(days, toDisabledMetricSet([]));
    const water = s.find((x) => x.key === 'water')!;
    expect(water).toMatchObject({ days: 0, avg: null, low: null, high: null });
  });
});
