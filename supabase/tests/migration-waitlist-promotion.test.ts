import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on the LATEST definitions after every migration (no database) for 0158: BK1/RO7 (decision D1), BK9 and BK27.
// The behaviour itself needs a write test with test accounts (listed in the migration's header and the batch A notes).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; body: string; file: string; acl: unknown[] }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};
const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations/0158_waitlist_late_refund_and_started_sessions.sql'), 'utf8');

describe('a place given from the waitlist after the cut-off is refundable until the session starts (BK1/RO7, D1)', () => {
  it('bookings record when, and whether after the cut-off, a booking came off the waitlist', () => {
    expect(migration).toMatch(/add column if not exists promoted_at timestamptz/);
    expect(migration).toMatch(/add column if not exists promoted_after_cutoff boolean not null default false/);
  });

  it('cancel_booking refunds before the cut-off, or a late promotion until the start', () => {
    const body = code('cancel_booking');
    expect(body).toMatch(/now\(\) < v_cutoff or \(coalesce\(v_booking\.promoted_after_cutoff, false\) and now\(\) < v_start\)/);
    expect(body).toMatch(/refund_booking_credits\(p_booking_id/);
  });

  it('both cancel paths promote through one function instead of their own copy', () => {
    for (const name of ['cancel_booking', 'coach_cancel_booking']) {
      const body = code(name);
      expect(body, name).toMatch(/perform public\.promote_from_waitlist\(v_booking\.class_id, v_booking\.booking_date\)/);
      expect(body, name).not.toMatch(/status = 'waitlist'/);
    }
  });

  it('promote_from_waitlist marks a late promotion, stops at the start, checks for a free place and takes book_class\'s lock', () => {
    const body = code('promote_from_waitlist');
    expect(body).toMatch(/promoted_at = now\(\), promoted_after_cutoff = v_late/);
    expect(body).toMatch(/v_late := now\(\) >= v_cutoff/);
    expect(body).toMatch(/if now\(\) >= v_start then\s+return null;/);
    expect(body).toMatch(/if v_booked >= v_class\.capacity then\s+return null;/);
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\(p_class_id::text \|\| p_date::text\)\)/);
    expect(body).toMatch(/retired_at is not null/);
    expect(body).toMatch(/from class_exceptions/);
  });

  it('only other functions can promote; members and coaches still cancel through the three cancel functions', () => {
    expect(access(latest('promote_from_waitlist'))).toEqual({ anon: false, authenticated: false });
    for (const name of ['cancel_booking', 'coach_cancel_booking', 'cancel_class_occurrence']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: true });
    }
  });
});

describe('the promotion notice is readable and says how to get the credit back (BK9)', () => {
  it('uses the day, date and time, not the raw date', () => {
    expect(code('session_label')).toMatch(/to_char\(p_date, 'FMDay FMDD FMMonth'\)/);
    expect(code('promote_from_waitlist')).toMatch(/public\.session_label\(p_date, v_class\.start_time\)/);
    expect(code('promote_from_waitlist')).not.toMatch(/\|\| p_date \|\|/);
  });

  it('says a late promotion is refundable until it starts, and gives the deadline otherwise', () => {
    const body = code('promote_from_waitlist');
    expect(body).toMatch(/you can still cancel for a full refund any time before it starts/);
    expect(body).toMatch(/Cancel by/);
  });

  it('the removal and cancellation notices use the readable date too', () => {
    expect(code('coach_cancel_booking')).toMatch(/public\.session_label\(v_booking\.booking_date, v_class\.start_time\)/);
    expect(code('cancel_class_occurrence')).toMatch(/public\.session_label\(p_date, v_class\.start_time\)/);
  });
});

describe('a session that has started can no longer be cancelled (BK27)', () => {
  it('cancel_class_occurrence compares the start time at the gym, not just the date', () => {
    const body = code('cancel_class_occurrence');
    expect(body).toMatch(/\(p_date \+ coalesce\(v_class\.start_time, time '00:00'\)\) <= \(now\(\) at time zone v_tz\)/);
    expect(body).toMatch(/already started or already happened/);
  });
});
