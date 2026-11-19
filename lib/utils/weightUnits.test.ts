import { describe, expect, it } from 'vitest';
import {
  formatStLb,
  formatWeight,
  formatWeightCompact,
  formatWeightDiff,
  formatWeightDiffForCoach,
  formatWeightForCoach,
  formatWeightShort,
  kgToStLb,
  parseStLb,
  sameWeightReading,
  stLbFields,
  stLbToKg,
  weightUnitOf,
} from './weightUnits';

// Same cases as packages/shared/src/utils/weightUnits.test.ts: the web and the phone must show the same weight.

describe('round trips without drift', () => {
  it('every stones-and-pounds weight a member can type (3 st to 62 st 13.9 lb) reads back exactly as typed', () => {
    for (let st = 3; st <= 62; st++) {
      for (let tenths = 0; tenths < 140; tenths++) {
        const lb = tenths / 10;
        const back = kgToStLb(stLbToKg(st, lb));
        if (back.st !== st || back.lb !== lb) throw new Error(`${st} st ${lb} lb read back as ${back.st} st ${back.lb} lb`);
      }
    }
  });

  it('a stored weight shown in stones and pounds and saved again is the same reading, and is not saved at all', () => {
    for (let hundredths = 2000; hundredths <= 40000; hundredths++) {
      const kg = hundredths / 100;
      const shown = stLbFields(kg);
      const typed = parseStLb(shown.st, shown.lb);
      if (!typed.ok || typed.kg == null) throw new Error(`${kg} kg did not parse back`);
      if (formatStLb(typed.kg) !== formatStLb(kg)) throw new Error(`${kg} kg moved to ${typed.kg} kg`);
      if (!sameWeightReading(kg, typed.kg, 'st_lb')) throw new Error(`${kg} kg would be saved again`);
    }
  });

  it('saving the same reading a hundred times never moves it', () => {
    let kg = 78.2;
    for (let i = 0; i < 100; i++) {
      const f = stLbFields(kg);
      const next = parseStLb(f.st, f.lb);
      if (next.ok && next.kg != null && !sameWeightReading(kg, next.kg, 'st_lb')) kg = next.kg;
    }
    expect(kg).toBe(78.2);
  });
});

describe('kgToStLb and stLbToKg', () => {
  it('converts known weights', () => {
    expect(kgToStLb(76.2)).toEqual({ st: 12, lb: 0 }); // 167.99 lb
    expect(kgToStLb(73)).toEqual({ st: 11, lb: 6.9 }); // 160.94 lb
    expect(kgToStLb(78.24)).toEqual({ st: 12, lb: 4.5 });
    expect(stLbToKg(12, 4.5)).toBe(78.24);
    expect(stLbToKg(11, 7)).toBe(73.03);
  });
  it('never shows 14 lb', () => {
    expect(kgToStLb(76.19)).toEqual({ st: 12, lb: 0 });
    expect(kgToStLb(6.35)).toEqual({ st: 1, lb: 0 });
  });
});

describe('parseStLb', () => {
  it('reads the two boxes', () => {
    expect(parseStLb('12', '4.5')).toEqual({ ok: true, kg: 78.24 });
    expect(parseStLb(' 12 ', '4,5')).toEqual({ ok: true, kg: 78.24 });
    expect(parseStLb('12', '')).toEqual({ ok: true, kg: stLbToKg(12, 0) });
    expect(parseStLb('', '')).toEqual({ ok: true, kg: null });
    expect(parseStLb('12', '4.46')).toEqual({ ok: true, kg: stLbToKg(12, 4.5) });
  });
  it('refuses what is not a weight', () => {
    expect(parseStLb('12.5', '0').ok).toBe(false);
    expect(parseStLb('12', '14').ok).toBe(false);
    expect(parseStLb('12', '13.96').ok).toBe(false);
    expect(parseStLb('12', '-1').ok).toBe(false);
    expect(parseStLb('x', '1').ok).toBe(false);
    expect(parseStLb('12', '4.5.1').ok).toBe(false);
  });
});

describe('formatting', () => {
  it('shows a weight in the member\'s units', () => {
    expect(formatWeight(78.24, 'kg')).toBe('78.2 kg');
    expect(formatWeight(78.24, 'st_lb')).toBe('12 st 4.5 lb');
    expect(formatWeight(76.2, 'st_lb')).toBe('12 st 0 lb');
  });
  it('shows a difference', () => {
    expect(formatWeightDiff(-1.36, 'kg')).toBe('1.4 kg');
    expect(formatWeightDiff(1.4, 'st_lb')).toBe('3.1 lb');
    expect(formatWeightDiff(-7.26, 'st_lb')).toBe('1 st 2 lb');
  });
  it('fits a small box or an axis', () => {
    expect(formatWeightCompact(78.24, 'kg')).toBe('78.2');
    expect(formatWeightCompact(78.24, 'st_lb')).toBe('12st 4.5');
    expect(formatWeightShort(78.24, 'kg')).toBe('78.2');
    expect(formatWeightShort(78.24, 'st_lb')).toBe('12st 5');
    expect(formatWeightShort(82.3, 'st_lb')).toBe('12st 13'); // 181.4 lb
    expect(formatWeightShort(88.72, 'st_lb')).toBe('14st 0'); // 195.6 lb rounds to 196 lb, 14 st exactly
  });
  it('gives the coach kilograms alongside', () => {
    expect(formatWeightForCoach(78.24, 'st_lb')).toBe('12 st 4.5 lb (78.2 kg)');
    expect(formatWeightForCoach(78.24, 'kg')).toBe('78.2 kg');
    expect(formatWeightDiffForCoach(1.4, 'st_lb')).toBe('3.1 lb (1.4 kg)');
    expect(formatWeightDiffForCoach(-1.4, 'kg')).toBe('1.4 kg');
  });
});

describe('weightUnitOf', () => {
  it('reads anything but st_lb as kilograms', () => {
    expect(weightUnitOf('st_lb')).toBe('st_lb');
    expect(weightUnitOf('kg')).toBe('kg');
    expect(weightUnitOf(undefined)).toBe('kg');
    expect(weightUnitOf(null)).toBe('kg');
  });
});
