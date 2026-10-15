import { describe, expect, it } from 'vitest';
import { currentAndNext, minuteOfDayIn, todayAtGym } from './todaySessions';

const sessions = [
  { id: 'late', startTime: '18:00:00' },
  { id: 'early', startTime: '06:00:00' },
  { id: 'mid', startTime: '12:30:00' },
];

describe('currentAndNext', () => {
  it('before the first session, the first one is up next and nothing is happening', () => {
    const r = currentAndNext(sessions, 5 * 60);
    expect(r.inProgress).toBeUndefined();
    expect(r.upNext?.id).toBe('early');
  });

  it('during a session it is "happening now" and also what the screen shows first', () => {
    const r = currentAndNext(sessions, 6 * 60 + 20);
    expect(r.inProgress?.id).toBe('early');
    expect(r.upNext?.id).toBe('early');
  });

  it('moves on to the next one when the 45 minutes are over', () => {
    expect(currentAndNext(sessions, 6 * 60 + 44).inProgress?.id).toBe('early');
    const after = currentAndNext(sessions, 6 * 60 + 45);
    expect(after.inProgress).toBeUndefined();
    expect(after.upNext?.id).toBe('mid');
  });

  it('after the last session there is nothing up next', () => {
    const r = currentAndNext(sessions, 19 * 60);
    expect(r.inProgress).toBeUndefined();
    expect(r.upNext).toBeNull();
  });

  it('copes with a day with no sessions', () => {
    expect(currentAndNext([], 600)).toEqual({ inProgress: undefined, upNext: null });
  });
});

describe('the gym clock', () => {
  it('reads the minute of the day at the gym, not in UTC', () => {
    const at = new Date('2026-10-15T22:30:00Z');
    expect(minuteOfDayIn('UTC', at)).toBe(22 * 60 + 30);
    expect(minuteOfDayIn('Europe/London', at)).toBe(23 * 60 + 30); // BST in October
    expect(minuteOfDayIn('Pacific/Auckland', at)).toBe(11 * 60 + 30); // 13 hours ahead, next day
  });

  it('knows when a gym has gone past midnight', () => {
    const at = new Date('2026-10-15T22:30:00Z');
    expect(todayAtGym('Europe/London', at)).toBe('2026-10-15');
    expect(todayAtGym('Pacific/Auckland', at)).toBe('2026-10-16');
  });
});
