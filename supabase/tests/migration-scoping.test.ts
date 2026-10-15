import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// Static checks on the SQL files (no database) for fix brief 02: the gym-scoping and permission rules must still be in the
// latest definition of each function after every migration is replayed. The live behaviour is checked by
// supabase/tests/security-audit/gym-scoping-check.cjs against a sandbox project.
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
const bodyOf = (name: string) => latest(name).body;
// Comments in a body must not satisfy or break a check.
const code = (name: string) => bodyOf(name).replace(/--.*$/gm, '');

describe('the member\'s gym decides, not the coach\'s active gym (R36, R38)', () => {
  it('red flag stats select members by their own gym', () => {
    const body = code('red_flag_week_stats');
    expect(body).toMatch(/client_gym_id\(c\.id\)\s*=\s*p_gym/);
    expect(body).not.toMatch(/coach\.gym_id/);
  });

  it('broadcast recipients and the member-side scoping gym use the member\'s own gym', () => {
    expect(code('communication_recipients')).toMatch(/client_gym_id\(c\.id\)\s*=\s*p_gym/);
    expect(code('communication_recipients')).not.toMatch(/coach\.gym_id/);
    expect(code('my_scoping_gym_id')).not.toMatch(/coach\.gym_id/);
  });

  it.each([
    ['start_membership'],
    ['assign_membership'],
    ['assign_form'],
    ['assign_education_course'],
    ['instantiate_program_template'],
    ['book_class_for_client'],
  ])('%s refuses an object from another gym', (name) => {
    expect(code(name)).toMatch(/same_gym_as_client\(/);
    expect(code(name)).toMatch(/That belongs to a different gym\./);
  });

  it('assign_form and assign_education_course no longer compare with the coach\'s active gym', () => {
    expect(code('assign_form')).not.toMatch(/my_gym_id\(\)/);
    expect(code('assign_education_course')).not.toMatch(/my_gym_id\(\)/);
    expect(code('instantiate_program_template')).not.toMatch(/my_gym_id\(\)/);
  });

  it('booking a member in as a coach has the same four checks as the member\'s own booking', () => {
    const body = code('book_class_for_client');
    expect(body).toMatch(/in the past/);
    expect(body).toMatch(/doesn.{1,2}t run on that date/);
    expect(body).toMatch(/has been cancelled/);
  });
});

describe('red flags are read-only to view (RF1)', () => {
  it('red_flag_report never generates, and takes an optional gym', () => {
    const fn = latest('red_flag_report');
    expect(fn.key).toBe('red_flag_report(date,uuid)');
    expect(code('red_flag_report')).not.toMatch(/generate_red_flag_week/);
    expect(code('red_flag_report')).not.toMatch(/\binsert\b|\bupdate\b|\bdelete\b/i);
  });

  it('the old one-argument report is gone (a one-argument call would be ambiguous)', () => {
    expect(fns.filter((f) => f.name === 'red_flag_report').map((f) => f.key)).toEqual(['red_flag_report(date,uuid)']);
  });

  it('only a signed-in caller who may see the gym, and only the latest week, can generate by hand', () => {
    const body = code('generate_red_flag_week');
    expect(body).toMatch(/can_view_gym\(p_gym\)/);
    expect(body).toMatch(/latest_completed_week/);
  });
});

describe('permission checks (CM3, GA1)', () => {
  it('apply_programme_rollout is null-safe', () => {
    const body = code('apply_programme_rollout');
    expect(body).toMatch(/my_gym_id\(\) is null/);
    expect(body).toMatch(/is distinct from public\.my_gym_id\(\)/);
    expect(body).not.toMatch(/<>\s*public\.my_gym_id\(\)/);
  });

  it('cancel_class_occurrence refuses a past date', () => {
    expect(code('cancel_class_occurrence')).toMatch(/already happened/);
  });

  it('gym settings are bounded', () => {
    expect(code('_rename_gym')).toMatch(/char_length\(v_name\) > 80/);
    expect(code('set_default_checkin_reminder_days')).toMatch(/p_days > 60/);
    expect(code('set_logo_path')).toMatch(/auth\.uid\(\)::text/);
  });

  it('the last gym admin cannot be demoted, under a lock on the gym', () => {
    const body = code('_set_gym_admin');
    expect(body).toMatch(/for update/);
    expect(body).toMatch(/at least one admin/);
    expect(code('_remove_coach_from_gym')).toMatch(/at least one admin/);
  });
});

describe('owner and admin functions (CH1, R37)', () => {
  it('is_same_gym_as_client no longer lets the owner through', () => {
    expect(code('is_same_gym_as_client')).not.toMatch(/is_owner_of_gym/);
  });

  it.each([
    ['owner_gym_roster'],
    ['owner_set_gym_admin'],
    ['owner_add_coach_to_gym'],
    ['owner_remove_coach_from_gym'],
    ['owner_reassign_clients'],
    ['owner_rename_gym'],
    ['owner_set_gym_booking_settings'],
  ])('%s checks the caller owns the gym and is callable by signed-in users only', (name) => {
    const fn = latest(name);
    expect(code(name)).toMatch(/is_owner_of_gym\(p_gym\)/);
    expect(fn.securityDefiner).toBe(true);
    expect(access(fn)).toEqual({ anon: false, authenticated: true });
  });

  it.each([['reassign_clients'], ['remove_coach_from_gym']])('%s checks gym admin or owner', (name) => {
    const body = code(name);
    expect(body).toMatch(/is_admin_of_gym\(p_gym\)/);
    expect(body).toMatch(/is_owner_of_gym\(p_gym\)/);
    expect(access(latest(name))).toEqual({ anon: false, authenticated: true });
  });

  it('internal functions cannot be called by anyone but other functions', () => {
    for (const name of ['_rename_gym', '_set_gym_booking_settings', '_set_gym_admin', '_add_coach_to_gym', '_reassign_clients', '_remove_coach_from_gym', 'same_gym_as_client', 'can_view_gym']) {
      expect(access(latest(name)), name).toEqual({ anon: false, authenticated: false });
    }
  });

  it('the owner roster reads no health data', () => {
    const body = code('owner_gym_roster');
    for (const forbidden of ['food_diary_entries', 'manual_macro_entries', 'food_photo_entries', 'form_responses', 'client_coach_notes', 'client_journal_entries', 'progress_photos', 'body_scans', 'chat_messages', 'health_notes', 'body_fat', 'start_weight', 'goal_weight', 'workout_logs']) {
      expect(body, forbidden).not.toContain(forbidden);
    }
  });
});

describe('owner statistics use each gym\'s own calendar (CM6)', () => {
  it('no current_date in the owner statistics', () => {
    expect(code('owner_gym_stats')).not.toMatch(/current_date/);
    expect(code('owner_activity_report')).not.toMatch(/current_date/);
  });

  it('the owner statistics ask for the gym\'s local date', () => {
    expect(code('owner_gym_stats')).toMatch(/local_date\(g\.timezone\)/);
  });
});

describe('migration numbers for brief 02', () => {
  it('0129, 0130 and 0131 exist and the clean-up script is not a migration', () => {
    const migrations = fs.readdirSync(path.resolve(__dirname, '../migrations'));
    for (const prefix of ['0129_', '0130_', '0131_']) {
      expect(migrations.some((f) => f.startsWith(prefix)), prefix).toBe(true);
    }
    expect(migrations.some((f) => f.includes('red_flag_entries_wrong_gym'))).toBe(false);
  });
});
