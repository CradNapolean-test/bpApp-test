import { describe, expect, it } from 'vitest';
import {
  REST_SOUND_KEY,
  addRest,
  alertAtEnd,
  formatRest,
  readRestSound,
  restFraction,
  restRemaining,
  skipRest,
  startRest,
  writeRestSound,
} from './restTimer';

const T0 = 1_700_000_000_000;

describe('rest timer (TR16)', () => {
  it('counts down from the rest', () => {
    const s = startRest(T0, 90);
    expect(restRemaining(s, T0)).toBe(90);
    expect(restRemaining(s, T0 + 30_000)).toBe(60);
    expect(restRemaining(s, T0 + 89_800)).toBe(1);
    expect(restRemaining(s, T0 + 90_000)).toBe(0);
    expect(restRemaining(s, T0 + 200_000)).toBe(0);
  });

  it('keeps the right time after the page slept (an end time, not a count)', () => {
    const s = startRest(T0, 60);
    expect(restRemaining(s, T0 + 45_000)).toBe(15);
  });

  it('+30s adds to what is left and to the whole rest', () => {
    const s = startRest(T0, 60);
    const more = addRest(s, T0 + 50_000);
    expect(restRemaining(more, T0 + 50_000)).toBe(40);
    expect(more.totalSeconds).toBe(90);
    expect(addRest(more, T0 + 50_000).totalSeconds).toBe(120);
  });

  it('+30s tapped just after the time ran out gives 30 seconds from then; a skipped rest stays skipped', () => {
    const s = startRest(T0, 60);
    const late = addRest(s, T0 + 60_100);
    expect(late).toMatchObject({ done: false, totalSeconds: 30 });
    expect(restRemaining(late, T0 + 60_100)).toBe(30);
    expect(addRest(skipRest(s), T0)).toMatchObject({ done: true });
  });

  it('buzzes and beeps only when the end is noticed in time, not minutes later after the phone was locked', () => {
    const s = startRest(T0, 90);
    expect(alertAtEnd(s, T0 + 90_250)).toBe(true);
    expect(alertAtEnd(s, T0 + 94_000)).toBe(true);
    expect(alertAtEnd(s, T0 + 90_000 + 5 * 60_000)).toBe(false);
    expect(alertAtEnd(skipRest(s), T0 + 90_250)).toBe(false);
  });

  it('Skip ends the rest at once', () => {
    const s = skipRest(startRest(T0, 120));
    expect(s.done).toBe(true);
    expect(restRemaining(s, T0)).toBe(0);
    expect(restFraction(s, T0)).toBe(0);
  });

  it('the bar empties over the whole rest, +30s included', () => {
    const s = startRest(T0, 60);
    expect(restFraction(s, T0)).toBe(1);
    expect(restFraction(s, T0 + 30_000)).toBeCloseTo(0.5);
    const more = addRest(s, T0 + 30_000);
    expect(restFraction(more, T0 + 30_000)).toBeCloseTo(60 / 90);
    expect(restFraction(s, T0 + 70_000)).toBe(0);
  });

  it('a rest of 0 is over before it starts', () => {
    expect(startRest(T0, 0).done).toBe(true);
    expect(startRest(T0, -5)).toMatchObject({ done: true, totalSeconds: 0 });
  });

  it('formats minutes and seconds', () => {
    expect(formatRest(90)).toBe('1:30');
    expect(formatRest(5)).toBe('0:05');
    expect(formatRest(0)).toBe('0:00');
    expect(formatRest(600)).toBe('10:00');
  });
});

describe('rest timer sound setting (on this device only)', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
  };

  it('is off until turned on', () => {
    expect(readRestSound(store())).toBe(false);
    expect(readRestSound(null)).toBe(false);
  });

  it('remembers on and off', () => {
    const s = store();
    writeRestSound(s, true);
    expect(s.m.get(REST_SOUND_KEY)).toBe('on');
    expect(readRestSound(s)).toBe(true);
    writeRestSound(s, false);
    expect(readRestSound(s)).toBe(false);
  });

  it('a storage that throws (private browsing) leaves sound off and does not break', () => {
    const broken = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
    };
    expect(readRestSound(broken)).toBe(false);
    expect(() => writeRestSound(broken, true)).not.toThrow();
  });
});
