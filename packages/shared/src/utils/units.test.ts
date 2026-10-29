import { describe, expect, it } from 'vitest';

import { cmToFtIn, ftInToCm, kgToStLb, stLbToKg } from './units';

describe('stLbToKg', () => {
  it('converts stones and pounds to kilograms to one decimal', () => {
    expect(stLbToKg(12, 0)).toBe(76.2);
    expect(stLbToKg('11', '7')).toBe(73.0);
    expect(stLbToKg(0, 14)).toBe(6.4);
  });
  it('is null for nothing', () => {
    expect(stLbToKg('', '')).toBeNull();
    expect(stLbToKg(0, 0)).toBeNull();
    expect(stLbToKg('x', 'y')).toBeNull();
  });
});

describe('ftInToCm', () => {
  it('converts feet and inches to whole centimetres', () => {
    expect(ftInToCm(5, 7)).toBe(170);
    expect(ftInToCm('6', '0')).toBe(183);
    expect(ftInToCm(0, 10)).toBe(25);
  });
  it('is null for nothing', () => {
    expect(ftInToCm('', '')).toBeNull();
    expect(ftInToCm(0, 0)).toBeNull();
  });
});

describe('kgToStLb', () => {
  it('shows kilograms as stones and pounds', () => {
    expect(kgToStLb(76.2)).toEqual({ st: 12, lb: 0 });
    expect(kgToStLb(73)).toEqual({ st: 11, lb: 6.9 }); // 73 kg is 160.9 lb; 11 st 7 lb rounds up to 73.0 kg
  });
  it('never shows 14 lb', () => {
    const { lb } = kgToStLb(76.19);
    expect(lb).toBeLessThan(14);
  });
});

describe('cmToFtIn', () => {
  it('shows centimetres as feet and inches', () => {
    expect(cmToFtIn(170)).toEqual({ ft: 5, inch: 7 });
    expect(cmToFtIn(183)).toEqual({ ft: 6, inch: 0 });
  });
});
