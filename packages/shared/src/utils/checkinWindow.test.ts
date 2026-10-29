import { describe, expect, it } from 'vitest';
import { CHECKIN_CLOSES_AFTER_MIN, CHECKIN_OPENS_BEFORE_MIN, checkinWindow } from './checkinWindow';

// Pacific/Auckland is UTC+13 on 2026-10-12 (daylight saving began in late September), so a 06:00 NZ class is 17:00Z the day before.
const TZ = 'Pacific/Auckland';
const DATE = '2026-10-12';

describe('checkinWindow', () => {
  it('is open all day when the class has no start time', () => {
    expect(checkinWindow(null, DATE, TZ, new Date('2026-10-12T00:00:00Z'))).toEqual({ state: 'open' });
  });

  it('is not open yet well before the session and says when it opens', () => {
    const now = new Date('2026-10-11T16:00:00Z'); // 05:00 NZ
    expect(checkinWindow('06:00:00', DATE, TZ, now)).toEqual({ state: 'not_open_yet', opensAt: '5:30am' });
  });

  it('opens exactly 30 minutes before the start (the server rule, migration 0132)', () => {
    expect(CHECKIN_OPENS_BEFORE_MIN).toBe(30);
    expect(checkinWindow('06:00', DATE, TZ, new Date('2026-10-11T16:29:00Z')).state).toBe('not_open_yet'); // 05:29
    expect(checkinWindow('06:00', DATE, TZ, new Date('2026-10-11T16:30:00Z')).state).toBe('open'); // 05:30
  });

  it('is open during the session and for 60 minutes after the start, then closes', () => {
    expect(CHECKIN_CLOSES_AFTER_MIN).toBe(60);
    expect(checkinWindow('06:00', DATE, TZ, new Date('2026-10-11T18:00:00Z')).state).toBe('open'); // 07:00
    expect(checkinWindow('06:00', DATE, TZ, new Date('2026-10-11T18:01:00Z')).state).toBe('closed'); // 07:01
  });

  it('uses the member timezone, not the device or UTC', () => {
    // 06:00 London (BST, UTC+1) is 05:00Z. At 17:00Z the same instant it is long closed in London.
    expect(checkinWindow('06:00', DATE, 'Europe/London', new Date('2026-10-12T17:00:00Z')).state).toBe('closed');
    expect(checkinWindow('06:00', DATE, 'Europe/London', new Date('2026-10-12T05:00:00Z')).state).toBe('open');
  });
});
