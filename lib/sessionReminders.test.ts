import { describe, expect, it } from 'vitest';
import { dueReminders, reminderAtMs, sessionReminderPayload, sessionStartMs, type ReminderBooking } from './sessionReminders';

const LONDON = 'Europe/London';
const at = (iso: string) => new Date(iso);
const booking = (over: Partial<ReminderBooking> = {}): ReminderBooking => ({
  bookingId: 'b1',
  clientId: 'm1',
  className: 'Strength & Conditioning',
  date: '2026-11-20',
  startTime: '18:00:00',
  timeZone: LONDON,
  bookedAt: '2026-11-18T09:00:00Z',
  ...over,
});
const due = (b: ReminderBooking, now: string) => dueReminders([b], at(now)).map((r) => r.when);

describe('when a session starts', () => {
  it('reads the date and start time as the gym\'s wall clock', () => {
    expect(sessionStartMs('2026-11-20', '18:00:00', LONDON)).toBe(Date.parse('2026-11-20T18:00:00Z')); // GMT
    expect(sessionStartMs('2026-07-10', '18:00', LONDON)).toBe(Date.parse('2026-07-10T17:00:00Z')); // BST
  });

  it('has no start without a time', () => {
    expect(sessionStartMs('2026-11-20', null, LONDON)).toBeNull();
    expect(sessionStartMs('not a date', '18:00', LONDON)).toBeNull();
  });
});

describe('when the reminder goes (D20)', () => {
  it('is 2 hours before in the daytime', () => {
    expect(reminderAtMs(Date.parse('2026-11-20T18:00:00Z'), LONDON)).toBe(Date.parse('2026-11-20T16:00:00Z'));
  });

  it('is 8 pm the evening before for an early class (2 hours before is in quiet hours)', () => {
    expect(reminderAtMs(Date.parse('2026-11-20T06:00:00Z'), LONDON)).toBe(Date.parse('2026-11-19T20:00:00Z'));
    expect(reminderAtMs(Date.parse('2026-11-20T08:30:00Z'), LONDON)).toBe(Date.parse('2026-11-19T20:00:00Z'));
  });

  it('is 8 pm the same evening for a late session', () => {
    expect(reminderAtMs(Date.parse('2026-11-20T23:30:00Z'), LONDON)).toBe(Date.parse('2026-11-20T20:00:00Z'));
  });
});

describe('dueReminders', () => {
  it('a 6 pm session is due at the 4:05 pm run, not at 3:05 pm and not once it has started', () => {
    expect(due(booking(), '2026-11-20T15:05:00Z')).toEqual([]);
    expect(due(booking(), '2026-11-20T16:05:00Z')).toEqual(['today']);
    expect(due(booking(), '2026-11-20T17:55:00Z')).toEqual(['today']);
    expect(due(booking(), '2026-11-20T18:05:00Z')).toEqual([]);
  });

  it('a session at half past is reminded up to half an hour early, so close to 2 hours', () => {
    expect(due(booking({ startTime: '18:30' }), '2026-11-20T16:05:00Z')).toEqual(['today']);
  });

  it('follows British Summer Time', () => {
    const july = booking({ date: '2026-07-10', bookedAt: '2026-07-01T09:00:00Z' });
    expect(due(july, '2026-07-10T14:05:00Z')).toEqual([]);
    expect(due(july, '2026-07-10T15:05:00Z')).toEqual(['today']);
  });

  it('an early class is reminded the evening before, never in the night', () => {
    const early = booking({ startTime: '06:00' });
    expect(due(early, '2026-11-19T19:05:00Z')).toEqual([]);
    expect(due(early, '2026-11-19T20:05:00Z')).toEqual(['tomorrow']);
    expect(due(early, '2026-11-19T21:05:00Z')).toEqual([]);
    expect(due(early, '2026-11-20T04:05:00Z')).toEqual([]);
  });

  it('an 8:30 class missed the evening before is still reminded at 7:05 that morning', () => {
    expect(due(booking({ startTime: '08:30' }), '2026-11-20T07:05:00Z')).toEqual(['today']);
  });

  it('someone who booked (or came off the waiting list) after the reminder time is not reminded', () => {
    expect(due(booking({ bookedAt: '2026-11-20T15:45:00Z' }), '2026-11-20T16:05:00Z')).toEqual([]);
    expect(due(booking({ bookedAt: '2026-11-20T15:25:00Z' }), '2026-11-20T16:05:00Z')).toEqual(['today']);
  });

  it('a session with no start time is never reminded', () => {
    expect(due(booking({ startTime: null }), '2026-11-20T16:05:00Z')).toEqual([]);
  });

  it('works in the gym\'s own timezone', () => {
    const nz = booking({ timeZone: 'Pacific/Auckland', date: '2026-11-21', startTime: '18:00' }); // 05:00Z on the 21st (NZDT)
    expect(due(nz, '2026-11-21T02:35:00Z')).toEqual(['today']);
    expect(due(nz, '2026-11-21T02:25:00Z')).toEqual([]);
  });
});

describe('sessionReminderPayload', () => {
  it('names the session and the time, opens the booking screen, and is one notification per booking', () => {
    const p = sessionReminderPayload({ bookingId: 'b1', className: 'Strength & Conditioning', startTime: '18:00:00', when: 'today' });
    expect(p.title).toBe('Strength & Conditioning today at 6 pm');
    expect(p.body).toMatch(/Cancel in the app/);
    expect(p.url).toBe('/dashboard?open=book');
    expect(p.tag).toBe('session-reminder-b1');
    expect(sessionReminderPayload({ bookingId: 'b2', className: 'Yoga', startTime: '06:30', when: 'tomorrow' }).title).toBe('Yoga tomorrow at 6:30 am');
  });
});
