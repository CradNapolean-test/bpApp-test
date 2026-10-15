import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on the SQL files (no database) for fix brief 03: credits, bookings and integrity. They look at the LATEST definition
// of each function after every migration is replayed in order. The live behaviour is checked by
// supabase/tests/security-audit/credits-integrity-check.cjs against a sandbox project.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; body: string; securityDefiner: boolean; file: string; acl: unknown[] }[];
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
const migrationsDir = path.resolve(__dirname, '../migrations');
const migrationText = (prefix: string) =>
  fs.readFileSync(path.join(migrationsDir, fs.readdirSync(migrationsDir).find((f) => f.startsWith(prefix)) as string), 'utf8');

describe('refunds go through one function and respect the weekly allowance (CH4, D1)', () => {
  it('refund_booking_credits caps membership refunds at the plan allowance and never goes below zero', () => {
    const body = code('refund_booking_credits');
    expect(body).toMatch(/credits_per_week/);
    expect(body).toMatch(/least\(v_amount, greatest\(v_allowance - v_membership_balance, 0\)\)/);
    expect(body).toMatch(/v_row\.bucket = 'membership'/);
  });

  it('it locks the member, nets off earlier refunds, and writes a zero row when the cap leaves nothing to give back', () => {
    const body = code('refund_booking_credits');
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\('credits:'/);
    expect(body).toMatch(/having -sum\(delta\) > 0/);
    expect(body).toMatch(/v_amount = 0 then/);
  });

  it('it cannot be called by anyone but other functions', () => {
    expect(access(latest('refund_booking_credits'))).toEqual({ anon: false, authenticated: false });
  });

  it.each([['cancel_booking'], ['coach_cancel_booking'], ['cancel_class_occurrence'], ['retire_class']])(
    '%s refunds through the shared function and not by writing refund rows itself',
    (name) => {
      const body = code(name);
      expect(body).toMatch(/refund_booking_credits\(/);
      expect(body).not.toMatch(/v_deduction/);
    }
  );

  it('a refund the cap reduced to nothing is not counted as a late cancel', () => {
    expect(code('red_flag_week_stats')).toMatch(/l\.delta >= 0/);
  });
});

describe('sessions are retired, not deleted (CH2, D15)', () => {
  it('bookings.class_id no longer cascades', () => {
    const text = migrationText('0132_');
    expect(text).toMatch(/foreign key \(class_id\) references public\.classes\(id\) on delete restrict/);
  });

  it('a session with any booking cannot be deleted, with a readable message', () => {
    expect(code('classes_refuse_delete_with_bookings')).toMatch(/exists \(select 1 from bookings where class_id = old\.id\)/);
  });

  it('retire_class locks the session, is limited to the coach\'s own gym, and cancels only future bookings', () => {
    const body = code('retire_class');
    expect(body).toMatch(/for update/);
    expect(body).toMatch(/v_class\.gym_id is distinct from public\.my_gym_id\(\)/);
    expect(body).toMatch(/> v_now_local/);
    expect(body).toMatch(/set retired_at = now\(\)/);
  });

  it.each([['book_class'], ['book_class_for_client']])('%s refuses a retired session and reads the row FOR SHARE', (name) => {
    const body = code(name);
    expect(body).toMatch(/retired_at/);
    expect(body).toMatch(/no longer running/);
    expect(body).toMatch(/for share/);
  });
});

describe('editing and attending sessions (R26, SV1, L6)', () => {
  it('the capacity and weekday of a booked session are guarded, and a time change notifies', () => {
    const guard = code('classes_guard_changes');
    expect(guard).toMatch(/new\.capacity < old\.capacity/);
    expect(guard).toMatch(/new\.day_of_week is distinct from old\.day_of_week/);
    expect(guard).toMatch(/Retire this slot/);
    expect(code('classes_notify_changes')).toMatch(/Class time changed/);
  });

  it.each([['mark_attendance'], ['mark_attendance_status']])('%s refuses a date that has not happened yet', (name) => {
    const body = code(name);
    expect(body).toMatch(/public\.local_date\(v_tz\)/);
    expect(body).toMatch(/hasn''t happened yet/);
  });

  it('check-in opens 30 minutes before and closes 60 minutes after the class starts (D5)', () => {
    const body = code('check_in_booking');
    expect(body).toMatch(/v_start_at - interval '30 minutes'/);
    expect(body).toMatch(/v_start_at \+ interval '60 minutes'/);
    expect(body).toMatch(/Check-in opens 30 minutes before the class\./);
    expect(body).toMatch(/Check-in has closed\./);
  });
});

describe('credit grants and removals (CM9)', () => {
  it.each([['grant_credits'], ['remove_credits'], ['grant_credit_pack']])('%s is for the member\'s coach, locks the member and is signed-in only', (name) => {
    const body = code(name);
    expect(body).toMatch(/is_coach_of\(p_client\)/);
    expect(body).toMatch(/pg_advisory_xact_lock\(hashtext\('credits:'/);
    expect(access(latest(name))).toEqual({ anon: false, authenticated: true });
  });

  it('amounts are capped at 50, the grant is a bonus credit by the caller, and a removal cannot overdraw', () => {
    expect(code('grant_credits')).toMatch(/p_amount > 50/);
    expect(code('grant_credits')).toMatch(/'bonus', auth\.uid\(\)/);
    expect(code('remove_credits')).toMatch(/p_amount > 50/);
    expect(code('remove_credits')).toMatch(/< p_amount/);
  });

  it('a pack must be in the member\'s gym', () => {
    expect(code('grant_credit_pack')).toMatch(/same_gym_as_client\(v_pack\.gym_id, p_client\)/);
  });

  it('migration 0143 is the last migration, drops only the direct insert, and says when to apply it', () => {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
    expect(files[files.length - 1].startsWith('0143_')).toBe(true);
    const text = migrationText('0143_');
    expect(text).toMatch(/drop policy if exists "coach grants credits" on public\.credits_ledger/);
    expect(text).toMatch(/APPLY THIS ONLY AFTER BRIEF 05/);
  });

  it('after every migration nobody signed in can write the credits ledger directly', () => {
    const left = replayPolicies().get('credits_ledger') ?? new Map<string, string>();
    expect([...left.entries()].filter(([, command]) => command !== 'select')).toEqual([]);
  });
});

describe('programme rollouts and imports are all-or-nothing (R5, CL3)', () => {
  it('schedule_programme_rollout checks the audience, the gym and the coach, then inserts and applies in one function', () => {
    const body = code('schedule_programme_rollout');
    expect(body).toMatch(/Only a gym admin can start a programme for everyone/);
    expect(body).toMatch(/same_gym_as_client\(v_gym, i\)/);
    expect(body).toMatch(/v_template\.gym_id is distinct from v_gym/);
    expect(body.indexOf('insert into programme_rollouts')).toBeLessThan(body.indexOf('apply_programme_rollout'));
    expect(access(latest('schedule_programme_rollout'))).toEqual({ anon: false, authenticated: true });
  });

  it('import_program_template has the limits and checks the JSON shape null-safely', () => {
    const body = code('import_program_template');
    expect(body).toMatch(/20 \* 14/);
    expect(body).toMatch(/> 60 then/);
    expect(body).toMatch(/> 20 then/);
    expect(body).toMatch(/having count\(\*\) > 14/);
    expect(body).toMatch(/coalesce\(jsonb_typeof\(p_json -> 'days'\), ''\) <> 'array'/);
    expect(access(latest('import_program_template'))).toEqual({ anon: false, authenticated: true });
  });

  it('the import helpers cannot be called directly', () => {
    for (const name of ['_import_text', '_import_number', '_import_int']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: false });
    }
  });
});

describe('deleting a group no longer fails and never sends to everyone (R33)', () => {
  it('a group broadcast may lose its group; other audiences may not have one', () => {
    expect(migrationText('0133_')).toMatch(/check \(target_type = 'group' or target_group_id is null\)/);
  });

  it('deleting a group cancels its pending broadcasts and the history keeps the name', () => {
    expect(code('client_groups_cancel_broadcasts')).toMatch(/set cancelled_at = now\(\)/);
    expect(code('client_groups_cancel_broadcasts')).toMatch(/sent_at is null/);
    expect(code('scheduled_communications_prepare')).toMatch(/new\.target_group_name/);
  });

  it('the sender ignores cancelled broadcasts and cancels a group broadcast whose group is gone', () => {
    const body = code('send_due_communications');
    expect(body).toMatch(/cancelled_at is null/);
    expect(body).toMatch(/not exists \(select 1 from client_groups g where g\.id = v_comm\.target_group_id\)/);
  });

  it('a group target with no group reaches nobody', () => {
    const body = code('communication_recipients');
    expect(body).toMatch(/p_target = 'group'/);
    expect(body).toMatch(/m\.group_id = p_group/);
  });
});
