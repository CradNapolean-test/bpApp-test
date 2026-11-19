import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The hourly session-reminder job end to end, with the database and the push replaced: nothing here touches a real project or sends
// anything. The fake session_reminders keeps the booking id unique and answers only the rows an insert added, as Postgres does for
// "on conflict do nothing" (and every row when the job asks to update instead), so a job that reminds a booking twice fails here.
const GYM = 'gym-1';
const pushed: string[] = [];
const jobRuns: { ok: boolean; detail?: string | null }[] = [];
let claimedRows = new Set<string>();
let bookings: Record<string, unknown>[] = [];

type Result = { data: unknown; error: { message: string } | null };

function table(name: string) {
  let op: 'read' | 'upsert' | 'delete' = 'read';
  let rows: { booking_id: string }[] = [];
  let ignoreDuplicates = false;
  const result = (): Result => {
    if (name === 'session_reminders') {
      if (op === 'delete') return { data: null, error: null };
      const answered: { booking_id: string }[] = [];
      for (const r of rows) {
        const added = !claimedRows.has(r.booking_id);
        claimedRows.add(r.booking_id);
        if (added || !ignoreDuplicates) answered.push({ booking_id: r.booking_id });
      }
      return { data: answered, error: null };
    }
    if (name === 'bookings') return { data: bookings, error: null };
    if (name === 'gyms') return { data: [{ id: GYM, timezone: 'Europe/London' }], error: null };
    return { data: [], error: null }; // class_exceptions (none cancelled), client_profiles (nobody opted out)
  };
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'gte', 'lte', 'order', 'range', 'in', 'lt']) chain[method] = () => chain;
  chain.delete = () => {
    op = 'delete';
    return chain;
  };
  chain.upsert = (input: { booking_id: string }[], options: { ignoreDuplicates?: boolean }) => {
    op = 'upsert';
    rows = input;
    ignoreDuplicates = options?.ignoreDuplicates === true;
    return chain;
  };
  chain.then = (resolve: (r: Result) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve()
      .then(result)
      .then(resolve, reject);
  return chain;
}

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: (name: string) => table(name) }) }));
vi.mock('@/lib/cronAuth', () => ({ isAuthorizedCron: () => true }));
vi.mock('@/lib/pushConfig', () => ({ checkPushConfig: () => ({ ok: true }) }));
vi.mock('@/lib/jobRuns', () => ({
  recordJobRun: async (_job: string, ok: boolean, detail?: string | null) => {
    jobRuns.push({ ok, detail });
  },
}));
vi.mock('@/lib/push', () => ({
  pushQuietly: async (_label: string, send: () => Promise<unknown>) => send(),
  sendPushToClient: async (_clientId: string, payload: { tag?: string }) => {
    pushed.push(payload.tag ?? '');
    return { sent: 1, failed: 0 };
  },
}));

import { GET } from './route';

const booking = (id: string, clientId: string) => ({
  id,
  client_id: clientId,
  class_id: 'class-1',
  booking_date: '2026-11-20',
  created_at: '2026-11-18T09:00:00Z',
  promoted_at: null,
  classes: { name: 'Strength & Conditioning', start_time: '18:00:00', gym_id: GYM },
});
const run = () => GET(new Request('https://app.example.com/api/cron/session-reminders'));

beforeEach(() => {
  // 15:40 in London on the day of an 18:00 session: its reminder is due (2 hours before, up to half an hour early).
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-20T15:40:00Z'));
  pushed.length = 0;
  jobRuns.length = 0;
  claimedRows = new Set();
  bookings = [booking('b1', 'm1'), booking('b2', 'm2')];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('/api/cron/session-reminders never reminds a booking twice', () => {
  it('reminds each due booking once, and the next run (still inside the reminder window) reminds nobody again', async () => {
    const first = await (await run()).json();
    expect(first).toMatchObject({ due: 2, claimed: 2, sent: 2, failed: 0 });
    vi.setSystemTime(new Date('2026-11-20T15:55:00Z'));
    const second = await (await run()).json();
    expect(second).toMatchObject({ due: 2, claimed: 0, sent: 0 });
    expect(pushed.sort()).toEqual(['session-reminder-b1', 'session-reminder-b2']);
    expect(jobRuns.every((j) => j.ok)).toBe(true);
  });

  it('two runs at the same time remind each booking once between them', async () => {
    await Promise.all([run(), run()]);
    expect(pushed.sort()).toEqual(['session-reminder-b1', 'session-reminder-b2']);
  });

  it('a booking made after a run is reminded by the next one, and only that booking', async () => {
    bookings = [booking('b1', 'm1')];
    await run();
    bookings = [booking('b1', 'm1'), { ...booking('b3', 'm3'), created_at: '2026-11-19T09:00:00Z' }];
    await run();
    expect(pushed.sort()).toEqual(['session-reminder-b1', 'session-reminder-b3']);
  });
});
