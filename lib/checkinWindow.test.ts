import { describe, expect, it } from 'vitest';
import { CHECKIN_CLOSES_AFTER_MIN, CHECKIN_OPENS_BEFORE_MIN, checkinWindow } from './checkinWindow';

const MIN = 60_000;
const start = Date.UTC(2026, 9, 15, 17, 45); // 5:45 pm

describe('check-in window (R17, D5)', () => {
  it('is 30 minutes before to 60 minutes after, the same as the server', () => {
    expect(CHECKIN_OPENS_BEFORE_MIN).toBe(30);
    expect(CHECKIN_CLOSES_AFTER_MIN).toBe(60);
  });

  it('is not open yet earlier than 30 minutes before, and says when it opens', () => {
    expect(checkinWindow(start, start - 31 * MIN)).toEqual({ state: 'not_yet', opensAtMs: start - 30 * MIN });
    expect(checkinWindow(start, start - 3 * 60 * MIN)).toMatchObject({ state: 'not_yet' });
  });

  it('opens exactly 30 minutes before the start', () => {
    expect(checkinWindow(start, start - 30 * MIN)).toEqual({ state: 'open' });
  });

  it('stays open through the session and for an hour after the start', () => {
    expect(checkinWindow(start, start)).toEqual({ state: 'open' });
    expect(checkinWindow(start, start + 60 * MIN)).toEqual({ state: 'open' });
  });

  it('closes after an hour past the start', () => {
    expect(checkinWindow(start, start + 61 * MIN)).toEqual({ state: 'closed' });
  });

  it('is open all day for a session with no start time', () => {
    expect(checkinWindow(null, start)).toEqual({ state: 'open' });
  });
});
