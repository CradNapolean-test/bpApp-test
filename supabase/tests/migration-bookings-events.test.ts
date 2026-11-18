import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ModelMember } from './creditWeekModel';

// Static checks on migration 0171 (no database): D13a, D13b, events and sign-in links. They read the LATEST definition of each function
// after every migration is replayed in order. The week-boundary rules of D13b are also run on creditWeekModel.ts, a step-for-step copy
// of the SQL. The behaviour in the database needs write tests with test accounts (listed in the migration's header).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; body: string; file: string; acl: unknown[]; securityDefiner: boolean; searchPath: string | null }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};
const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
// Comments in a body must not satisfy or break a check.
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');
const file = '0171_bookings_events_signin_links.sql';
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations', file), 'utf8').replace(/\r\n/g, '\n');
// The md5 the guard compares: the body with every run of white space squeezed to one space, trimmed (as the SQL does with prosrc).
const bodyMd5 = (body: string) => crypto.createHash('md5').update(body.replace(/\s+/g, ' ').trim()).digest('hex');

// Every definition of a function, in apply order (parseFunctions keeps only the last one).
const migrationsDir = path.resolve(__dirname, '../migrations');
const migrationFiles = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
function definitionsOf(name: string): { file: string; body: string }[] {
  const out: { file: string; body: string }[] = [];
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?(\\$[a-z_]*\\$)`, 'gi');
  for (const f of migrationFiles) {
    const sql = fs.readFileSync(path.join(migrationsDir, f), 'utf8').replace(/\r\n/g, '\n');
    for (const m of sql.matchAll(re)) {
      const start = (m.index ?? 0) + m[0].length;
      out.push({ file: f, body: sql.slice(start, sql.indexOf(m[1], start)) });
    }
  }
  return out;
}

// The functions this file replaces, the migration each must come from, and that body's md5.
const guardRows = [...migration.matchAll(/\('(\w+)', '(\d{4})', array\[([^\]]*)\]\)/g)].map((m) => ({
  name: m[1],
  from: m[2],
  accepted: [...m[3].matchAll(/'([0-9a-f]{32})'/g)].map((a) => a[1]),
}));

describe('migration 0171 is safe to paste into the SQL editor', () => {
  it('stops before changing anything when a replaced function is not the expected one', () => {
    const guardAt = migration.indexOf('do $guard$');
    expect(guardAt).toBeGreaterThan(0);
    // Nothing is created, altered or dropped above the guard.
    expect(migration.slice(0, guardAt).replace(/--.*$/gm, '')).not.toMatch(/\b(create|alter|drop|insert|update|delete)\b/i);
    expect(migration).toMatch(/raise exception '% is not the one from migration %/);
  });

  it('the guard accepts exactly the old body and this file\'s body of every function it replaces', () => {
    expect(guardRows.length).toBeGreaterThan(0);
    for (const row of guardRows) {
      const all = definitionsOf(row.name);
      const before = all.filter((f) => f.file < file);
      const mine = all.filter((f) => f.file === file);
      // The last definition before this file is the one named, so the live body should be it; this file defines it once.
      expect(before[before.length - 1]?.file.slice(0, 4), `${row.name}: latest before 0171`).toBe(row.from);
      expect(mine.length, row.name).toBe(1);
      expect(row.accepted, row.name).toEqual([bodyMd5(before[before.length - 1].body), bodyMd5(mine[0].body)]);
      expect(bodyMd5(latest(row.name).body), row.name).toBe(row.accepted[1]);
    }
  });

  it('every function this file replaces is in the guard', () => {
    const mine = fns.filter((f) => f.file === file).map((f) => f.name);
    const replaced = mine.filter((n) => definitionsOf(n).some((d) => d.file < file));
    expect([...new Set(replaced)].sort()).toEqual(guardRows.map((r) => r.name).sort());
  });

  it('can be run twice and shares no temporary table between statements', () => {
    const sql = migration.replace(/--.*$/gm, '');
    expect(sql).not.toMatch(/temporary table|temp table/i);
    expect(sql).not.toMatch(/create function /i);
    expect(sql).not.toMatch(/create table (?!if not exists)/i);
    expect(sql).not.toMatch(/add column (?!if not exists)/i);
    for (const m of sql.matchAll(/create policy "([^"]+)"\s+on ([\w.]+)/g)) {
      expect(sql, m[1]).toContain(`drop policy if exists "${m[1]}" on ${m[2]}`);
    }
  });

  it('has read-only PRE-FLIGHT and AFTER queries and says when to apply it', () => {
    expect(migration).toMatch(/PRE-FLIGHT \(read-only\)/);
    expect(migration).toMatch(/AFTER \(read-only\)/);
    expect(migration).toMatch(/BEFORE the web app/);
  });

  it('every function it adds or replaces runs with a pinned search path', () => {
    for (const f of fns.filter((g) => g.file === file && g.securityDefiner)) expect(f.searchPath, f.name).toBe('public');
  });
});

describe('D13a: a plan\'s end cancels and refunds its member\'s upcoming bookings', () => {
  it('cancels only sessions that have not started, in the gym\'s timezone', () => {
    const body = code('cancel_bookings_for_ended_plan');
    expect(body).toMatch(/b\.status in \('booked', 'waitlist'\)/);
    expect(body).toMatch(/\(b\.booking_date \+ coalesce\(c\.start_time, time '00:00'\)\) at time zone coalesce\(nullif\(g\.timezone, ''\), 'UTC'\)\) > now\(\)/);
  });

  it('refunds through the one shared refund function and gives the place to the waitlist', () => {
    const body = code('cancel_bookings_for_ended_plan');
    expect(body).toMatch(/refund_booking_credits\(v_booking\.id, 'Refunded ' \|\| v_booking\.name \|\| ' \(plan ended\)'\)/);
    expect(body).toMatch(/promote_from_waitlist\(v_booking\.class_id, v_booking\.booking_date\)/);
    // The ledger only gains rows: nothing here updates or deletes it.
    expect(body).not.toMatch(/(update|delete from) credits_ledger/);
  });

  it('a refund is only made once, even if the booking was cancelled meanwhile', () => {
    expect(code('cancel_bookings_for_ended_plan')).toMatch(/where id = v_booking\.id and status in \('booked', 'waitlist'\);\s+if not found then\s+continue;/);
  });

  it('clear_membership_credits cancels the bookings before clearing, so refunded weekly credits are cleared too', () => {
    const body = code('clear_membership_credits');
    const cancelAt = body.indexOf('cancel_bookings_for_ended_plan(p_client_id)');
    expect(cancelAt).toBeGreaterThan(-1);
    expect(cancelAt).toBeLessThan(body.indexOf("'membership ended'"));
    // A weekly balance below 0 (a plan changed to fewer credits after sessions were held, D13b) is cleared as well.
    expect(body).toMatch(/if v_balance <> 0 then/);
  });

  it('weekly credits still held for a later week are dropped when the plan ends', () => {
    expect(code('cancel_bookings_for_ended_plan')).toMatch(
      /update bookings b set weekly_credits = 0\s+where b\.client_id = p_client\s+and b\.weekly_credits > 0\s+and not exists \(select 1 from credits_ledger l where l\.booking_id = b\.id and l\.bucket = 'membership'\)/
    );
  });

  it('both ways a plan ends go through clear_membership_credits, and changing a plan does not', () => {
    expect(code('end_membership')).toMatch(/perform clear_membership_credits\(v_m\.client_id\)/);
    expect(code('replenish_due_memberships')).toMatch(/clear_membership_credits\(v_membership\.client_id\)/);
    expect(code('start_membership')).not.toMatch(/clear_membership_credits|cancel_bookings_for_ended_plan/);
  });

  it('only other database functions can call either', () => {
    for (const name of ['cancel_bookings_for_ended_plan', 'clear_membership_credits']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: false });
    }
  });
});

describe('D13b in SQL: a booking\'s credit counts in the week the session runs', () => {
  it('bookings record the weekly credits each one takes, 0 for every booking made before', () => {
    expect(migration).toMatch(/alter table public\.bookings add column if not exists weekly_credits integer not null default 0 check \(weekly_credits >= 0\)/);
  });

  it('a week that has started for the member pays from the weekly balance; a later week from its own allowance', () => {
    const body = code('session_credit_sources');
    expect(body).toMatch(/v_week date := public\.credit_week_start\(p_date\)/);
    expect(body).toMatch(/if v_reset is not null and v_week <= v_reset then\s+weekly_now := true;\s+weekly_left := greatest\(v_membership, 0\);/);
    // A hold counts whatever the status: a refund drops it, so a cancelled booking still holding was cancelled late.
    expect(body).toMatch(/when c\.net is not null then greatest\(-c\.net, 0\)\s+else b\.weekly_credits\s+end/);
    expect(body).toMatch(/b\.booking_date between v_week and v_week \+ 6/);
    expect(body).toMatch(/weekly_left := greatest\(v_allowance - v_taken, 0\)/);
    // No weekly credits outside the plan's days.
    expect(body).toMatch(/p_date < v_started or \(v_end is not null and p_date > v_end\)/);
  });

  it('charge_booking charges a started week now, holds a later week, and bonus credits always now', () => {
    const body = code('charge_booking');
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\('credits:'/);
    expect(body).toMatch(/if v_weekly > 0 and v_weekly_now then/);
    expect(body).toMatch(/update bookings set weekly_credits = v_weekly where id = p_booking/);
    expect(body).toMatch(/if v_bonus > greatest\(v_bonus_left, 0\) then\s+return false;/);
  });

  it('the week\'s reset sets the allowance less what that week already took, then charges every hold of that week', () => {
    const body = code('start_credit_week');
    expect(body).toMatch(/v_allowance \+ v_used - v_balance, 'membership reset: week of ' \|\| p_week/);
    expect(body).toMatch(/b\.weekly_credits > 0\s+and b\.booking_date between p_week and p_week \+ 6/);
    // The holds: any status (a late cancel keeps its hold), never charged, up to the end of this week.
    const loop = body.slice(body.indexOf('for v_held in'));
    expect(loop).toMatch(/where b\.client_id = v_client\s+and b\.weekly_credits > 0\s+and b\.booking_date <= p_week \+ 6\s+and not exists \(select 1 from credits_ledger l where l\.booking_id = b\.id and l\.bucket = 'membership'\)/);
    expect(loop).not.toMatch(/b\.status = 'booked'/);
    expect(loop).toMatch(/-v_held\.weekly_credits/);
    expect(loop).toMatch(/when v_held\.status = 'cancelled' then ' \(cancelled, no refund\)'/);
  });

  it.each([['book_class'], ['book_class_for_client']])('%s pays through charge_booking, undoes a booking it cannot pay, and refuses a day after the plan', (name) => {
    const body = code(name);
    expect(body).toMatch(/if not public\.charge_booking\(v_booking\.id, v_cost, /);
    expect(body).toMatch(/raise exception 'Not enough credits'/);
    expect(body).toMatch(/v_plan_last_day is not null and p_booking_date > v_plan_last_day/);
    expect(body).not.toMatch(/v_membership_balance|v_from_membership/);
  });

  it('promote_from_waitlist pays the same way and checks the plan before charging (no AND that could charge anyway)', () => {
    const body = code('promote_from_waitlist');
    expect(body).toMatch(/if v_plan_last_day is null or p_date <= v_plan_last_day then\s+if public\.charge_booking\(v_candidate\.id/);
    expect(body).not.toMatch(/v_membership_balance|v_from_membership/);
  });

  it('the one refund path drops a hold that was never charged; the cancel functions themselves are not changed', () => {
    const body = code('refund_booking_credits');
    expect(body).toMatch(
      /update bookings b set weekly_credits = 0\s+where b\.id = p_booking\s+and b\.weekly_credits > 0\s+and not exists \(select 1 from credits_ledger l where l\.booking_id = b\.id and l\.bucket = 'membership'\)/
    );
    // The hold goes after the member's credits are locked, before anything is given back.
    expect(body.indexOf('pg_advisory_xact_lock')).toBeLessThan(body.indexOf('set weekly_credits = 0'));
    expect(body).not.toMatch(/(update|delete from) credits_ledger/);
    // Every way a booking is cancelled with a refund goes through it, so none of them can leave a hold behind.
    for (const name of ['cancel_booking', 'coach_cancel_booking', 'cancel_class_occurrence', 'retire_class', 'cancel_bookings_for_ended_plan']) {
      expect(code(name), name).toMatch(/refund_booking_credits\(/);
    }
    expect(latest('cancel_booking').file).not.toBe(file);
    expect(latest('coach_cancel_booking').file).not.toBe(file);
  });

  it('the internal helpers are closed to the API; the Book screens\' question is for the member, their coach or their gym\'s coaches', () => {
    for (const name of ['session_credit_sources', 'charge_booking', 'start_credit_week', 'refund_booking_credits']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: false });
    }
    expect(access(latest('member_session_credits'))).toEqual({ anon: false, authenticated: true });
    expect(code('member_session_credits')).toMatch(/public\.is_self\(p_client\) or public\.is_coach_of\(p_client\) or public\.client_gym_id\(p_client\) = public\.my_gym_id\(\)/);
    expect(code('member_session_credits')).toMatch(/array_length\(p_dates, 1\), 0\) > 62/);
  });
});

// The rules on the model. Dates: the credit week of Sat 14 Nov 2026 runs to Fri 20 Nov; the next one starts Sat 21 Nov.
const THIS_WEEK = '2026-11-14';
const NEXT_WEEK = '2026-11-21';
function memberOnPlan(perWeek = 3) {
  const m = new ModelMember();
  m.plan = { startedAt: '2026-10-01', scheduledEnd: null, lastResetWeek: null, perWeek };
  m.startWeek(THIS_WEEK);
  return m;
}

describe('D13b week boundaries (model of the 0171 SQL)', () => {
  it('BK10: unused credits can no longer roll forward by booking ahead before Saturday', () => {
    const m = memberOnPlan(3);
    // Thursday 19 Nov, nothing used this week: book Mon, Wed and Fri next week.
    for (const d of ['2026-11-23', '2026-11-25', '2026-11-27']) m.book(d);
    expect(m.balance('membership')).toBe(3); // this week's credits untouched
    expect(() => m.book('2026-11-24')).toThrow('Not enough credits'); // next week is full at 3
    // Saturday's reset: next week's balance is what is left after the three held bookings, which are charged now.
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(0);
    expect(m.weeklyUsedFor(NEXT_WEEK)).toBe(3);
    expect(() => m.book('2026-11-24')).toThrow('Not enough credits');
  });

  it('booking next week leaves this week\'s credits for this week', () => {
    const m = memberOnPlan(3);
    m.book('2026-11-23');
    m.book('2026-11-19');
    m.book('2026-11-20');
    m.book('2026-11-18');
    expect(m.balance('membership')).toBe(0);
    expect(m.weeklyUsedFor(THIS_WEEK)).toBe(3);
  });

  it('Friday is the last day of a credit week and Saturday the first of the next', () => {
    const m = memberOnPlan(1);
    m.book('2026-11-20'); // Friday: this week, charged now
    expect(m.balance('membership')).toBe(0);
    const sat = m.book('2026-11-21'); // Saturday: next week, held
    expect(sat.weeklyCredits).toBe(1);
    expect(m.ledger.some((r) => r.bookingId === sat.id)).toBe(false);
    expect(() => m.book('2026-11-22')).toThrow('Not enough credits'); // Sunday is in the same (next) week
  });

  it('a session booked between midnight and the Saturday job is held until the job runs', () => {
    const m = memberOnPlan(2);
    // Saturday 21 Nov 00:30: the member's last reset is still 14 Nov, so a Saturday session is a later week.
    const b = m.book('2026-11-21');
    expect(m.sources('2026-11-21').weeklyNow).toBe(false);
    expect(m.balance('membership')).toBe(2);
    m.startWeek(NEXT_WEEK); // 03:00
    expect(m.balance('membership')).toBe(1);
    expect(m.ledger.filter((r) => r.bookingId === b.id)).toHaveLength(1);
  });

  it('a held booking cancelled in time gives nothing back (nothing was charged) and frees the week', () => {
    const m = memberOnPlan(1);
    const b = m.book('2026-11-23');
    m.cancel(b.id, true);
    expect(m.ledger.filter((r) => r.bookingId === b.id)).toHaveLength(0);
    expect(m.sources('2026-11-24').weeklyLeft).toBe(1);
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(1);
  });

  it('a held booking cancelled after its deadline is lost from its own week, and nothing is taken from the week it was cancelled in', () => {
    const m = memberOnPlan(3);
    const b = m.book('2026-11-21'); // Saturday 9am; the deadline is Friday evening
    m.cancel(b.id, false); // Friday 9pm, late
    expect(m.ledger.filter((r) => r.bookingId === b.id)).toHaveLength(0); // charged at the reset, not now
    expect(m.balance('membership')).toBe(3); // this week's credits untouched
    expect(m.sources('2026-11-20').weeklyLeft).toBe(3);
    expect(m.sources('2026-11-23').weeklyLeft).toBe(2); // next week already counts it
    m.startWeek(NEXT_WEEK);
    expect(m.ledger.filter((r) => r.bookingId === b.id).map((r) => [r.delta, r.reason])).toEqual([[-1, 'Booked (cancelled, no refund)']]);
    expect(m.balance('membership')).toBe(2);
    expect(m.weeklyUsedFor(NEXT_WEEK)).toBe(1);
  });

  it('a held booking taken off a session that the coach cancels (refunded) leaves no hold for the reset', () => {
    const m = memberOnPlan(2);
    const b = m.book('2026-11-24');
    b.status = 'cancelled';
    m.refund(b.id); // cancel_class_occurrence / retire_class refund through the same function
    expect(b.weeklyCredits).toBe(0);
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(2);
    expect(m.ledger.some((r) => r.bookingId === b.id)).toBe(false);
  });

  it('a charged booking cancelled in time is refunded, never above the weekly allowance', () => {
    const m = memberOnPlan(2);
    const b = m.book('2026-11-23');
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(1);
    m.cancel(b.id, true);
    expect(m.balance('membership')).toBe(2);
    // An old-style double refund is impossible: a second refund finds nothing charged.
    expect(m.refund(b.id)).toBe(0);
  });

  it('bookings made before 0171 keep the week they were paid in: not charged again at the reset', () => {
    const m = memberOnPlan(3);
    m.addOldBooking('2026-11-23'); // paid from this week's credits under the old rule
    expect(m.balance('membership')).toBe(2);
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(3);
  });

  it('bonus credits pay what the week cannot, at once, whichever week the session is in', () => {
    const m = memberOnPlan(1);
    m.ledger.push({ delta: 2, bucket: 'bonus', bookingId: null, reason: 'Added by coach' });
    m.book('2026-11-23'); // held weekly
    const second = m.book('2026-11-24'); // bonus
    expect(second.weeklyCredits).toBe(0);
    expect(m.balance('bonus')).toBe(1);
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(0);
    expect(m.balance('bonus')).toBe(1);
  });

  it('a plan changed mid-week gives the new allowance less what this week already used', () => {
    const m = memberOnPlan(2);
    m.book('2026-11-17');
    m.plan!.perWeek = 4;
    m.startWeek(THIS_WEEK); // the top-up for the new plan
    expect(m.balance('membership')).toBe(3);
  });

  it('a plan changed to fewer credits after a week was booked: that week starts below 0 and the Saturday after resets it', () => {
    const m = memberOnPlan(3);
    for (const d of ['2026-11-23', '2026-11-24', '2026-11-25']) m.book(d);
    m.plan!.perWeek = 1;
    m.startWeek(THIS_WEEK); // the top-up for the new plan; the next-week holds stay
    expect(m.sources('2026-11-26').weeklyLeft).toBe(0);
    m.startWeek(NEXT_WEEK);
    expect(m.balance('membership')).toBe(-2);
    expect(m.sources('2026-11-26').weeklyLeft).toBe(0); // shown and used as 0
    m.startWeek('2026-11-28');
    expect(m.balance('membership')).toBe(1);
  });

  it('a plan\'s end cancels what is upcoming, gives back bonus credits, drops the holds and clears the weekly balance', () => {
    const m = memberOnPlan(1);
    m.ledger.push({ delta: 1, bucket: 'bonus', bookingId: null, reason: 'Added by coach' });
    const thisWeek = m.book('2026-11-19'); // charged weekly now
    const held = m.book('2026-11-23'); // held next week
    const bonus = m.book('2026-11-24'); // bonus
    const lateHeld = m.book('2026-11-21', 0); // a free session, nothing held
    expect(lateHeld.weeklyCredits).toBe(0);
    m.endPlan('2026-11-19');
    expect([thisWeek, held, bonus].map((b) => b.status)).toEqual(['cancelled', 'cancelled', 'cancelled']);
    expect(held.weeklyCredits).toBe(0);
    expect(m.balance('bonus')).toBe(1);
    expect(m.balance('membership')).toBe(0);
    // Nothing is held any more, so a later plan's reset charges nothing from before.
    m.plan = { startedAt: '2026-11-28', scheduledEnd: null, lastResetWeek: null, perWeek: 2 };
    m.startWeek('2026-11-28');
    expect(m.balance('membership')).toBe(2);
  });

  it('no weekly credits after a plan\'s planned last day or before it starts, and booking after the last day is refused', () => {
    const m = memberOnPlan(3);
    m.plan!.scheduledEnd = '2026-11-22';
    expect(m.sources('2026-11-22').weeklyLeft).toBe(3);
    expect(m.sources('2026-11-23').weeklyLeft).toBe(0);
    expect(() => m.book('2026-11-23')).toThrow(/plan ends/);

    const n = new ModelMember();
    n.plan = { startedAt: '2026-11-25', scheduledEnd: null, lastResetWeek: null, perWeek: 2 };
    expect(n.sources('2026-11-24').weeklyLeft).toBe(0);
    const first = n.book('2026-11-25'); // held for the plan's first week
    expect(first.weeklyCredits).toBe(1);
    n.startWeek(NEXT_WEEK); // the job on the start date
    expect(n.balance('membership')).toBe(1);
  });
});
