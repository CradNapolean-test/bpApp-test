import { describe, expect, it } from 'vitest';
import {
  broadcastConfirmation,
  broadcastReach,
  formatInZone,
  gymAudienceNote,
  isPastSchedule,
  nowAsWallTime,
  reachLine,
  wallTimeToIso,
  weekdayInZone,
} from './broadcastSend';

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
    const c = broadcastConfirmation({ count: 40, channel: 'email', target: 'gym', gymName: 'Northside' });
    expect(c.body).toMatch(/everyone at Northside/);
    expect(broadcastConfirmation({ count: 40, channel: 'email', target: 'gym' }).body).toMatch(/everyone at the gym/);
  });

  it('says a whole-gym message only reaches the coach\'s own clients in the app (D21)', () => {
    const message = broadcastConfirmation({ count: 12, channel: 'message', target: 'gym', gymName: 'Northside' });
    expect(message.title).toBe('Send to 12 members by message?');
    expect(message.body).toMatch(/your own clients at Northside only/);
    expect(message.body).not.toMatch(/everyone/);
    const both = broadcastConfirmation({ count: 40, channel: 'both', target: 'gym' });
    expect(both.body).toMatch(/everyone at the gym by email/);
    expect(both.body).toMatch(/your own clients' chats in the app/);
  });
});

describe('broadcastReach and its wording (D21)', () => {
  const counts = { mine: 15, gym: 40, mineAtGym: 12 };

  it('a whole-gym message reaches only the coach\'s own clients at the gym in the app', () => {
    expect(broadcastReach({ target: 'gym', channel: 'message', counts, groupCount: 0 })).toEqual({ messaged: 12, emailed: 0, total: 12 });
  });

  it('a whole-gym email reaches everyone; both = everyone by email and the coach\'s own in the app', () => {
    expect(broadcastReach({ target: 'gym', channel: 'email', counts, groupCount: 0 })).toEqual({ messaged: 0, emailed: 40, total: 40 });
    expect(broadcastReach({ target: 'gym', channel: 'both', counts, groupCount: 0 })).toEqual({ messaged: 12, emailed: 40, total: 40 });
  });

  it('own clients and groups reach the same people both ways', () => {
    expect(broadcastReach({ target: 'my_clients', channel: 'both', counts, groupCount: 0 })).toEqual({ messaged: 15, emailed: 15, total: 15 });
    expect(broadcastReach({ target: 'group', channel: 'message', counts, groupCount: 7 })).toEqual({ messaged: 7, emailed: 0, total: 7 });
  });

  it('the note under Whole gym follows the channel', () => {
    expect(gymAudienceNote('message')).toMatch(/only goes into your own clients' chats/);
    expect(gymAudienceNote('email')).toMatch(/everyone at the gym/);
    expect(gymAudienceNote('email')).not.toMatch(/in-app/);
    expect(gymAudienceNote('both')).toMatch(/everyone at the gym.*in-app message only goes into your own/);
  });

  it('the count line says who is messaged and who is emailed', () => {
    const reach = (target: 'gym' | 'my_clients', channel: 'message' | 'email' | 'both') => broadcastReach({ target, channel, counts, groupCount: 0 });
    expect(reachLine({ target: 'gym', channel: 'message', reach: reach('gym', 'message'), repeat: false, gymName: 'Worsley' })).toBe('This will message 12 clients at Worsley.');
    expect(reachLine({ target: 'gym', channel: 'email', reach: reach('gym', 'email'), repeat: false })).toBe('This will email 40 clients.');
    expect(reachLine({ target: 'gym', channel: 'both', reach: reach('gym', 'both'), repeat: false })).toBe('This will email 40 clients and message your own 12 in the app.');
    expect(reachLine({ target: 'gym', channel: 'both', reach: reach('gym', 'both'), repeat: true })).toBe('Each week this emails 40 clients and messages your own 12 in the app.');
    expect(reachLine({ target: 'my_clients', channel: 'message', reach: reach('my_clients', 'message'), repeat: true })).toBe('Goes to 15 clients each week.');
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
