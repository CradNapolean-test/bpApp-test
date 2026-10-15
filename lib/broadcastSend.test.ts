import { describe, expect, it } from 'vitest';
import { broadcastConfirmation, formatInZone, isPastSchedule, nowAsWallTime, wallTimeToIso, weekdayInZone } from './broadcastSend';

describe('broadcastConfirmation (R25)', () => {
  it('asks with the count and the channel, even for a coach\'s own clients', () => {
    const c = broadcastConfirmation({ count: 12, channel: 'message', target: 'my_clients' });
    expect(c.title).toBe('Send to 12 members by message?');
    expect(c.body).toMatch(/your own clients/);
    expect(c.destructive).toBe(false);
  });

  it('uses stronger wording when email is involved', () => {
    const email = broadcastConfirmation({ count: 90, channel: 'email', target: 'gym' });
    expect(email.title).toBe('Send to 90 members by email?');
    expect(email.body).toMatch(/cannot be recalled/);
    expect(email.body).toMatch(/other coaches' clients/);
    expect(email.destructive).toBe(true);
    expect(email.confirmLabel).toBe('Send email');
    expect(broadcastConfirmation({ count: 1, channel: 'both', target: 'group', groupName: 'Morning crew' }).title).toBe('Send to 1 member by message and email?');
    expect(broadcastConfirmation({ count: 1, channel: 'both', target: 'group', groupName: 'Morning crew' }).body).toMatch(/"Morning crew"/);
  });

  it('names the gym for a coach who works in more than one', () => {
    const c = broadcastConfirmation({ count: 40, channel: 'message', target: 'gym', gymName: 'Northside' });
    expect(c.body).toMatch(/everyone at Northside/);
    expect(broadcastConfirmation({ count: 40, channel: 'message', target: 'gym' }).body).toMatch(/everyone at the gym/);
  });
});

describe('gym-timezone dates (R25)', () => {
  it('reads a typed time as the gym\'s wall clock, whatever timezone the browser is in', () => {
    // 9am on 20 Oct 2026 in London is BST (UTC+1); in Auckland it is NZDT (UTC+13).
    expect(wallTimeToIso('2026-10-20T09:00', 'Europe/London')).toBe('2026-10-20T08:00:00.000Z');
    expect(wallTimeToIso('2026-10-20T09:00', 'Pacific/Auckland')).toBe('2026-10-19T20:00:00.000Z');
  });

  it('follows the clocks changing', () => {
    expect(wallTimeToIso('2026-01-20T09:00', 'Europe/London')).toBe('2026-01-20T09:00:00.000Z'); // GMT
    expect(wallTimeToIso('2026-03-29T09:00', 'Europe/London')).toBe('2026-03-29T08:00:00.000Z'); // the day BST starts
    expect(wallTimeToIso('2026-10-25T09:00', 'Europe/London')).toBe('2026-10-25T09:00:00.000Z'); // the day BST ends
  });

  it('rejects text that is not a date and time', () => {
    expect(wallTimeToIso('', 'Europe/London')).toBeNull();
    expect(wallTimeToIso('tomorrow', 'Europe/London')).toBeNull();
  });

  it('knows what the wall clock says now at the gym', () => {
    const noonUtc = Date.UTC(2026, 9, 14, 12, 0);
    expect(nowAsWallTime('Europe/London', noonUtc)).toBe('2026-10-14T13:00');
    expect(nowAsWallTime('Pacific/Auckland', noonUtc)).toBe('2026-10-15T01:00');
  });

  it('rejects a time that has already passed at the gym', () => {
    const now = Date.UTC(2026, 9, 14, 12, 0); // 13:00 in London
    expect(isPastSchedule('2026-10-14T12:30', 'Europe/London', now)).toBe(true);
    expect(isPastSchedule('2026-10-14T13:30', 'Europe/London', now)).toBe(false);
    // The same wall-clock text is a different moment in Auckland, where it is already 01:00 on the 15th.
    expect(isPastSchedule('2026-10-14T13:30', 'Pacific/Auckland', now)).toBe(true);
    expect(isPastSchedule('nonsense', 'Europe/London', now)).toBe(true);
  });

  it('shows the weekday and time in the gym\'s timezone', () => {
    const iso = '2026-10-19T20:00:00.000Z'; // Monday evening UTC, already Tuesday in Auckland
    expect(weekdayInZone(iso, 'Pacific/Auckland')).toBe('Tuesday');
    expect(weekdayInZone(iso, 'Europe/London')).toBe('Monday');
    expect(formatInZone(iso, 'Europe/London')).toMatch(/Mon/);
  });
});
