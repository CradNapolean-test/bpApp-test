import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on migration 0172 (no database): gym programmes reach members who join later. They read the LATEST definition of each
// function after every migration is replayed in order. The behaviour in the database needs write tests with test accounts (listed in the
// migration's header).
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
const squeeze = (s: string) => s.replace(/\s+/g, ' ');
const file = '0172_gym_programmes.sql';
const migration = fs.readFileSync(path.resolve(__dirname, '../migrations', file), 'utf8').replace(/\r\n/g, '\n');
const migrationCode = migration.replace(/--.*$/gm, '');

// The body exactly as written in this file (between the dollar quotes), for the guard's md5.
function bodyInFile(name: string): string {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?(\\$[a-z_]*\\$)`, 'gi');
  const all = [...migration.matchAll(re)];
  expect(all).toHaveLength(1);
  const start = (all[0].index ?? 0) + all[0][0].length;
  return migration.slice(start, migration.indexOf(all[0][1], start));
}
// As the SQL does with prosrc: every run of white space squeezed to one space, trimmed.
const bodyMd5 = (body: string) => crypto.createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').trim()).digest('hex');

const guardRows = [...migration.matchAll(/\('(\w+)', '(\d{4})', array\[([^\]]*)\]\)/g)].map((m) => ({
  name: m[1],
  from: m[2],
  accepted: [...m[3].matchAll(/'([0-9a-f]{32})'/g)].map((a) => a[1]),
}));

const created = ['_gym_programme_today', '_give_gym_programme', 'client_profiles_join_gym_programme', 'gym_programmes', 'end_gym_programme', 'resolve_gym_programme_waiting'];

describe('migration 0172 is safe to paste into the SQL editor', () => {
  it('stops before changing anything when something it uses is missing or a function it creates has another body', () => {
    const guardAt = migration.indexOf('do $guard$');
    expect(guardAt).toBeGreaterThan(0);
    expect(migration.slice(0, guardAt).replace(/--.*$/gm, '')).not.toMatch(/\b(create|alter|drop|insert|update|delete)\b/i);
    expect(migration).toMatch(/raise exception '% is not the one from migration %/);
    for (const needed of ['_rollout_live_copies(uuid)', 'instantiate_template_core(uuid, uuid, text, date, uuid)', 'local_date(text, timestamptz)']) {
      expect(migration).toContain(`to_regprocedure('public.${needed}') is null`);
    }
    expect(migration).toMatch(/column_name = 'week_one'/);
    expect(migration).toMatch(/column_name = 'onboarding_completed_at'/);
  });

  it('guards every function it creates with that function’s own body, so a second run passes and another branch’s is not overwritten', () => {
    expect(guardRows.map((r) => r.name).sort()).toEqual([...created].sort());
    for (const row of guardRows) {
      expect(row.from).toBe('0172');
      expect(row.accepted).toEqual([bodyMd5(bodyInFile(row.name))]);
    }
    // a function that does not exist yet passes; one that exists with another body stops the migration
    expect(migration).toMatch(/if v_md5 is not null and not \(v_md5 = any \(v_check\.accepted\)\) then/);
  });

  it('replaces no function from an earlier migration', () => {
    const earlier = new Set(fns.filter((f) => f.file !== file).map((f) => f.name));
    for (const name of created) expect(earlier.has(name)).toBe(false);
    for (const untouched of ['apply_programme_rollout', 'schedule_programme_rollout', 'instantiate_template_core', 'apply_template_to_rollout', 'programme_rollout_usage']) {
      expect(latest(untouched).file).not.toBe(file);
    }
  });

  it('can run twice: tables, columns, rules and the trigger are created only if missing or dropped first, and nothing temporary', () => {
    expect(migrationCode).toMatch(/create table if not exists gym_programme_waiting/);
    expect(migrationCode).toMatch(/add column if not exists ended_at/);
    expect(migrationCode).toMatch(/add column if not exists ended_by/);
    expect(migrationCode).toMatch(/drop trigger if exists client_profiles_gym_programme on client_profiles;\s*create trigger client_profiles_gym_programme/);
    for (const m of migrationCode.matchAll(/create policy "([^"]+)"/g)) {
      expect(migrationCode).toContain(`drop policy if exists "${m[1]}"`);
    }
    expect(migrationCode).not.toMatch(/\btemp(orary)?\s+table\b/i);
  });
});

describe('who can do what (Row Level Security and function access)', () => {
  it('the waiting list has Row Level Security and no rules: only the functions read and write it', () => {
    expect(migrationCode).toMatch(/alter table gym_programme_waiting enable row level security/);
    const rules = replayPolicies().get('gym_programme_waiting');
    expect(rules === undefined || rules.size === 0).toBe(true);
  });

  it('coaches can no longer change a rollout straight through the API: read their gym’s, and cancel one not given out yet', () => {
    const rules = replayPolicies().get('programme_rollouts');
    expect(rules && Object.fromEntries(rules)).toEqual({
      'gym coaches read programme_rollouts': 'select',
      'gym coaches cancel scheduled programme_rollouts': 'delete',
    });
    // One for everyone at the gym only by a gym admin, as starting (0133) and ending one are.
    expect(squeeze(migrationCode)).toContain(
      "on programme_rollouts for delete using (gym_id = public.my_gym_id() and applied_at is null and (audience <> 'all' or public.is_admin_of_gym(gym_id)))"
    );
    expect(migration).toContain("to_regprocedure('public.is_admin_of_gym(uuid)') is null");
  });

  it('the internal functions and the trigger function cannot be called by anyone signed in; the three coach functions only when signed in', () => {
    for (const name of ['_gym_programme_today', '_give_gym_programme', 'client_profiles_join_gym_programme']) {
      expect(access(latest(name))).toEqual({ anon: false, authenticated: false });
    }
    for (const name of ['gym_programmes', 'end_gym_programme', 'resolve_gym_programme_waiting']) {
      expect(access(latest(name))).toEqual({ anon: false, authenticated: true });
    }
    for (const name of created) {
      expect(latest(name).securityDefiner).toBe(true);
      expect(latest(name).searchPath).toBe('public');
    }
  });

  it('the coach functions refuse anyone who is not a coach at the gym (my_gym_id is empty for members)', () => {
    for (const name of ['gym_programmes', 'end_gym_programme', 'resolve_gym_programme_waiting']) {
      expect(code(name)).toMatch(/if auth\.uid\(\) is null or v_gym is null then\s+raise exception/);
    }
    expect(code('end_gym_programme')).toMatch(/v_r\.gym_id is distinct from v_gym or v_r\.audience <> 'all'/);
    expect(code('resolve_gym_programme_waiting')).toMatch(/v_r\.gym_id is distinct from v_gym or v_r\.audience <> 'all'/);
  });

  it('only a gym admin can end a gym programme, as only a gym admin can start one for everyone', () => {
    expect(code('end_gym_programme')).toMatch(/p\.is_gym_admin\) then\s+raise exception 'Only a gym admin can end a gym programme\.'/);
    expect(code('end_gym_programme')).toMatch(/update programme_rollouts set ended_at = now\(\), ended_by = auth\.uid\(\) where id = v_r\.id and ended_at is null/);
  });

  it('a waiting member is decided by their own coach or a gym admin, at the member’s gym', () => {
    const body = code('resolve_gym_programme_waiting');
    expect(body).toMatch(/public\.client_gym_id\(p_client_id\) is distinct from v_gym/);
    expect(body).toMatch(/not coalesce\(public\.is_coach_of\(p_client_id\), false\)/);
    expect(body).toMatch(/_give_gym_programme\(p_rollout_id, p_client_id, true\)/);
  });

  it('the coach list shows waiting members only to their coach or a gym admin, and only while the programme is open', () => {
    const body = code('gym_programmes');
    expect(body).toMatch(/\(v_admin or coalesce\(public\.is_coach_of\(q\.client_id\), false\)\)/);
    expect(body).toMatch(/and t\.is_open/);
    expect(body).toMatch(/where t\.today <= t\.last_day/);
  });
});

describe('which programme a gym is on, and when it stops reaching new members', () => {
  const body = squeeze(code('_gym_programme_today'));

  it('is the newest whole-gym rollout that has been given out and has started', () => {
    expect(body).toContain("x.audience = 'all' and x.applied_at is not null and x.start_date <= t.today order by x.start_date desc, x.created_at desc limit 1");
  });

  it('counts week 1 from the Monday of its start date, as week_one does (0167)', () => {
    expect(body).toContain('r.start_date - (extract(isodow from r.start_date)::integer - 1) as week_one');
    expect(code('set_programme_week_one')).toContain("new.start_date - (extract(isodow from new.start_date)::integer - 1)");
  });

  it('is open until a coach ends it or the Sunday of its last week has passed', () => {
    expect(body).toContain('r.ended_at is null and tw.weeks > 0 and t.today <= w.week_one + 7 * tw.weeks - 1');
  });
});

describe('giving it to a member who joins later', () => {
  const give = squeeze(code('_give_gym_programme'));

  it('only for the programme their own gym is on today, while it is open', () => {
    expect(give).toContain('v_gym uuid := public.client_gym_id(p_client_id)');
    expect(give).toContain('v_g.rollout_id is distinct from p_rollout_id or not coalesce(v_g.is_open, false) then return \'closed\'');
  });

  it('never a second copy from the same rollout, checked under a per-member lock', () => {
    expect(give.indexOf('pg_advisory_xact_lock')).toBeGreaterThan(0);
    expect(give.indexOf('pg_advisory_xact_lock')).toBeLessThan(give.indexOf('wp.rollout_id = p_rollout_id'));
    expect(give).toMatch(/if exists \(select 1 from workout_programs wp where wp\.client_id = p_client_id and wp\.rollout_id = p_rollout_id\) then .* return 'has_it'/);
  });

  it('does not replace another programme that runs over the same dates: the member is listed for their coach instead', () => {
    expect(give).toContain('wp.rollout_id is distinct from p_rollout_id and wp.start_date <= v_g.last_day and e.last_day >= v_g.today');
    // weeks counted as the app does (programWeekStart), a programme with no workouts counting as one week
    expect(give).toContain('least(coalesce(wp.week_one, wp.start_date), wp.start_date) + 7 * greatest(coalesce(');
    expect(give).toMatch(/insert into gym_programme_waiting \(rollout_id, client_id, reason, other_program_id\) values \(p_rollout_id, p_client_id, 'own_programme', v_other\)/);
    // only when the coach has not chosen "Give it to them"
    expect(give).toMatch(/if coalesce\(p_force, false\) then .* else .*select wp\.id into v_other/);
  });

  it('"Give it to them" moves a programme of theirs that would take over part-way to the Monday after the gym programme', () => {
    // one that starts today (a tie) or later, up to the gym programme's last day; nothing that has started before today
    expect(give).toContain(
      'if coalesce(p_force, false) then update workout_programs wp set start_date = v_g.last_day + 1 where wp.client_id = p_client_id and wp.start_date is not null and wp.rollout_id is distinct from p_rollout_id and wp.start_date >= v_g.today and wp.start_date <= v_g.last_day; else'
    );
    // after the has_it check, under the lock, and before the copy is made
    expect(give.indexOf('set start_date = v_g.last_day + 1')).toBeGreaterThan(give.indexOf("return 'has_it'"));
    expect(give.indexOf('set start_date = v_g.last_day + 1')).toBeLessThan(give.indexOf('instantiate_template_core'));
    // the coach list says when their programme starts and what the gym's today is, so the wording and the confirm can tell
    const list = squeeze(code('gym_programmes'));
    expect(list).toContain("'other_starts', op.start_date");
    expect(list).toContain('t.last_day, t.today,');
  });

  it('starts today on the gym’s current week: the copy’s week 1 is the gym programme’s Monday', () => {
    expect(give).toContain('public.instantiate_template_core(v_g.template_id, p_client_id, v_g.program_name, v_g.today, p_rollout_id)');
    expect(give).toContain('update workout_programs set week_one = v_g.week_one where id = v_program.id');
  });

  it('happens when a member finishes setting up their profile, once, and never stops that save', () => {
    expect(squeeze(migrationCode)).toContain(
      'after insert or update of onboarding_completed_at on client_profiles for each row execute function public.client_profiles_join_gym_programme()'
    );
    const trigger = squeeze(code('client_profiles_join_gym_programme'));
    expect(trigger).toContain("if new.onboarding_completed_at is null or (tg_op = 'UPDATE' and old.onboarding_completed_at is not null) then return null");
    expect(trigger).toContain('_give_gym_programme(v_g.rollout_id, new.client_id, false)');
    expect(trigger).toMatch(/exception when others then begin insert into gym_programme_waiting .* 'failed'/);
    expect(trigger).toMatch(/exception when others then null; end;/);
  });
});
