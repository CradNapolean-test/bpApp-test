import { describe, expect, it } from 'vitest';
import {
  dueReminders,
  reminderAtMs,
  remindOnce,
  sessionReminderPayload,
  sessionStartMs,
  type DueReminder,
  type ReminderBooking,
  type ReminderClaims,
} from './sessionReminders';

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

// ---- never twice (D20) ----
// session_reminders as Postgres treats it: the booking id is the primary key. With ignoreDuplicates the insert is "on conflict do
// nothing", which answers only the rows it inserted; without it the rows already there are updated and answered too (so a job that
// dropped ignoreDuplicates would remind every booking again each hour, and these tests would catch it). Each insert is atomic, as the
// key makes it, while two runs can interleave around it.
function reminderTable() {
  const rows = new Set<string>();
  const events: string[] = [];
  let failure: string | null = null;
  const claims: ReminderClaims = {
    upsert(input, options) {
      return {
        select: async () => {
          await Promise.resolve();
          if (failure) return { data: null, error: { message: failure } };
          const answered: { booking_id: string }[] = [];
          for (const r of input) {
            const added = !rows.has(r.booking_id);
            rows.add(r.booking_id);
            if (added || !options.ignoreDuplicates) answered.push({ booking_id: r.booking_id });
          }
          events.push('claim');
          return { data: answered, error: null };
        },
      };
    },
  };
  return { claims, rows, events, fail: (message: string) => (failure = message) };
}

const dueFor = (bookingId: string, clientId = 'm1'): DueReminder => ({
  ...booking({ bookingId, clientId }),
  startsAt: '2026-11-20T18:00:00.000Z',
  when: 'today',
});

function pushes(events?: string[]) {
  const sent: string[] = [];
  const push = async (r: DueReminder) => {
    events?.push('push');
    await Promise.resolve();
    sent.push(r.bookingId);
    return { sent: 1, failed: 0 };
  };
  return { sent, push };
}

const count = (ids: string[]) => ids.reduce<Record<string, number>>((acc, id) => ({ ...acc, [id]: (acc[id] ?? 0) + 1 }), {});

describe('remindOnce: a booking is never reminded twice', () => {
  it('the next hourly run does not remind a booking the last one did', async () => {
    const table = reminderTable();
    const { sent, push } = pushes();
    const due = [dueFor('b1'), dueFor('b2', 'm2')];
    const first = await remindOnce(due, table.claims, push);
    const second = await remindOnce(due, table.claims, push);
    expect(count(sent)).toEqual({ b1: 1, b2: 1 });
    expect(first).toEqual({ ok: true, due: 2, claimed: 2, sent: 2, failed: 0 });
    expect(second).toEqual({ ok: true, due: 2, claimed: 0, sent: 0, failed: 0 });
  });

  it('two runs at the same time remind each booking once between them', async () => {
    const table = reminderTable();
    const { sent, push } = pushes();
    const due = [dueFor('b1'), dueFor('b2', 'm2'), dueFor('b3', 'm3')];
    await Promise.all([remindOnce(due, table.claims, push), remindOnce([...due].reverse(), table.claims, push)]);
    expect(count(sent)).toEqual({ b1: 1, b2: 1, b3: 1 });
  });

  it('a booking listed twice in one run is claimed and reminded once', async () => {
    const table = reminderTable();
    const { sent, push } = pushes();
    const run = await remindOnce([dueFor('b1'), dueFor('b1')], table.claims, push);
    expect(sent).toEqual(['b1']);
    expect(run).toMatchObject({ ok: true, due: 1, claimed: 1 });
  });

  it('only the bookings this run claimed are reminded (one claimed earlier is left out, a new one goes)', async () => {
    const table = reminderTable();
    table.rows.add('b1');
    const { sent, push } = pushes();
    await remindOnce([dueFor('b1'), dueFor('b2', 'm2')], table.claims, push);
    expect(sent).toEqual(['b2']);
  });

  it('claims before it pushes, and pushes nothing when the claim fails', async () => {
    const ordered = reminderTable();
    const { push: orderedPush } = pushes(ordered.events);
    await remindOnce([dueFor('b1'), dueFor('b2', 'm2')], ordered.claims, orderedPush);
    expect(ordered.events).toEqual(['claim', 'push', 'push']);

    const table = reminderTable();
    table.fail('database down');
    const { sent, push } = pushes();
    expect(await remindOnce([dueFor('b1')], table.claims, push)).toEqual({ ok: false, error: 'database down' });
    expect(sent).toEqual([]);
  });

  it('a push that threw counts as failed, and the booking stays claimed (it is not retried and so not sent twice)', async () => {
    const table = reminderTable();
    let calls = 0;
    const push = async () => {
      calls += 1;
      return null;
    };
    expect(await remindOnce([dueFor('b1')], table.claims, push)).toEqual({ ok: true, due: 1, claimed: 1, sent: 0, failed: 1 });
    await remindOnce([dueFor('b1')], table.claims, push);
    expect(calls).toBe(1);
    expect(table.rows.has('b1')).toBe(true);
  });

  it('does nothing at all with nothing due', async () => {
    const table = reminderTable();
    const { sent, push } = pushes();
    expect(await remindOnce([], table.claims, push)).toEqual({ ok: true, due: 0, claimed: 0, sent: 0, failed: 0 });
    expect(table.events).toEqual([]);
    expect(sent).toEqual([]);
  });
});