import { describe, expect, it } from 'vitest';
import { tvBlockLabel } from './tvBlockLabel';

describe('tvBlockLabel (CS17)', () => {
  it("shows the block's own time cap, not the slot length", () => {
    expect(tvBlockLabel('EMOM', { scoring: 'done', cap_seconds: 12 * 60 }, 10)).toBe("EMOM 12'");
    expect(tvBlockLabel('AMRAP', { scoring: 'rounds_reps', cap_seconds: 15 * 60 }, 20)).toBe("AMRAP 15'");
  });

  it('writes a time that is not whole minutes as minutes and seconds', () => {
    expect(tvBlockLabel('AMRAP', { scoring: 'rounds_reps', cap_seconds: 90 }, 10)).toBe('AMRAP 1:30');
  });

  it('adds rounds and work/rest', () => {
    expect(tvBlockLabel('Tabata', { scoring: 'rounds', rounds: 8, work_seconds: 20, rest_seconds: 10 }, 10)).toBe('TABATA · 8 ROUNDS · 20s ON / 10s OFF');
    expect(tvBlockLabel('Circuit', { scoring: 'rounds', rounds: 1 }, 10)).toBe('CIRCUIT · 1 ROUND');
    expect(tvBlockLabel('Circuit', { scoring: 'rounds', rest_seconds: 60 }, 10)).toBe('CIRCUIT · 60s REST');
    expect(tvBlockLabel('EMOM', { scoring: 'done', cap_seconds: 600, work_seconds: 40 }, 10)).toBe("EMOM 10' · 40s ON");
  });

  it('keeps the slot length for a timed block with no time set (blocks built before time caps)', () => {
    expect(tvBlockLabel('EMOM', { scoring: 'done' }, 10)).toBe("EMOM 10'");
    expect(tvBlockLabel('Partner AMRAP', { scoring: 'rounds_reps' }, 20)).toBe("PARTNER AMRAP 20'");
  });

  it('adds no time to an untimed format, and shows the numbers when there is no format', () => {
    expect(tvBlockLabel('Big Chipper', { scoring: 'time' }, 10)).toBe('BIG CHIPPER');
    expect(tvBlockLabel(null, { scoring: 'none' }, 10)).toBe('');
    expect(tvBlockLabel(null, { scoring: 'done', cap_seconds: 300 }, 10)).toBe("5'");
  });
});
