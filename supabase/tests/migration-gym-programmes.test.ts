import { createRequire } from 'node:module';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on migration 0172 (no database): a start for everyone is the gym's programme for a length fixed when it starts, and it
// reaches members who join later. They read the LATEST definition of each function after every migration is replayed in order. The
// behaviour in the database needs write tests with test accounts (listed in the migration's header).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; args: string; body: string; file: string; acl: unknown[]; securityDefiner: boolean; searchPath: string | null }[];
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
const dir = path.resolve(__dirname, '../migrations');
const read = (f: string) => fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n');
const migration = read(file);
const migrationCode = migration.replace(/--.*$/gm, '');

// The body exactly as written in this file (or another migration's text), between the dollar quotes, for the guard's md5.
function bodyInFile(name: string, sql = migration): string {
  const re = new RegExp(`create\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\([\\s\\S]*?\\)\\s*returns[\\s\\S]*?(\\$[a-z_]*\\$)`, 'gi');
  const all = [...sql.matchAll(re)];
  expect(all).toHaveLength(1);
  const start = (all[0].index ?? 0) + all[0][0].length;
  return sql.slice(start, sql.indexOf(all[0][1], start));
}
// As the SQL does with prosrc: every run of white space squeezed to one space, trimmed.
const bodyMd5 = (body: string) => crypto.createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').trim()).digest('hex');

const guardRows = [...migration.matchAll(/\('public\.(\w+)\(([^)]*)\)', '(\d{4})', array\[([^\]]*)\]\)/g)].map((m) => ({
  name: m[1],
  args: m[2],
  from: m[3],
  accepted: [...m[4].matchAll(/'([0-9a-f]{32})'/g)].map((a) => a[1]),
}));

const created = [
  '_gym_programme_today',
  '_give_gym_programme',
  'client_profiles_join_gym_programme',
  'gym_programmes',
  'change_gym_programme',
  'resolve_gym_programme_waiting',
  'program_templates_refuse_gym_programme_delete',
];
const file0167 = read('0167_programme_rollout_updates.sql');
const file0130 = read('0130_gym_scoping_and_permission_checks.sql');
const file0133 = read('0133_credits_rollouts_imports_groups.sql');
const lastDayFrom = (alias: string, weekOne: string) => `${weekOne} + 7 * ${alias}.weeks - 1`;

describe('migration 0172 is safe to paste into the SQL editor', () => {
  it('stops before changing anything when something it uses is missing or a function has another body', () => {
    const guardAt = migration.indexOf('do $guard$');
    expect(guardAt).toBeGreaterThan(0);
    expect(migration.slice(0, guardAt).replace(/--.*$/gm, '')).not.toMatch(/\b(create|alter|drop|insert|update|delete)\b/i);
    expect(migration).toMatch(/raise exception '% is not the one from migration %/);
    for (const needed of [
      '_rollout_live_copies(uuid)',
      'instantiate_template_core(uuid, uuid, text, date, uuid)',
      'local_date(text, timestamptz)',
      'same_gym_as_client(uuid, uuid)',
      'is_admin_of_gym(uuid)',
      'set_programme_week_one()',
      'apply_programme_rollout(uuid)',
    ]) {
      expect(migration).toContain(`to_regprocedure('public.${needed}') is null`);
    }
    expect(migration).toMatch(/column_name = 'week_one'/);
    expect(migration).toMatch(/column_name = 'onboarding_completed_at'/);
    // each function by its exact arguments (schedule_programme_rollout has two)
    expect(migration).toContain('where p.oid = to_regprocedure(v_check.signature)::oid;');
    expect(migration).toMatch(/if v_md5 is not null and not \(v_md5 = any \(v_check\.accepted\)\) then/);
  });

  it('guards every function it creates with that function’s own body only, so a second run passes and another branch’s is not overwritten', () => {
    expect(guardRows.map((r) => `${r.name}(${r.args})`).sort()).toEqual(
      [
        '_gym_programme_today(uuid)',
        '_give_gym_programme(uuid, uuid, boolean)',
        'client_profiles_join_gym_programme()',
        'gym_programmes()',
        'change_gym_programme(uuid, integer, boolean)',
        'resolve_gym_programme_waiting(uuid, uuid, boolean)',
        'program_templates_refuse_gym_programme_delete()',
        'schedule_programme_rollout(uuid, text, date, text, uuid[], boolean, integer)',
        'set_programme_week_one()',
        'apply_programme_rollout(uuid)',
        'schedule_programme_rollout(uuid, text, date, text, uuid[], boolean)',
      ].sort()
    );
    for (const name of created) {
      const row = guardRows.find((r) => r.name === name);
      expect(row?.from).toBe('0172');
      expect(row?.accepted).toEqual([bodyMd5(bodyInFile(name))]);
    }
    const withLength = guardRows.find((r) => r.name === 'schedule_programme_rollout' && r.args.endsWith('integer'));
    expect(withLength?.from).toBe('0172');
    expect(withLength?.accepted).toEqual([bodyMd5(bodyInFile('schedule_programme_rollout'))]);
  });

  it('the functions it replaces must be the live one from the earlier migration, or this file’s (a second run); no earlier copy of 0172', () => {
    const week = guardRows.find((r) => r.name === 'set_programme_week_one');
    expect(week?.from).toBe('0167');
    expect(week?.accepted).toEqual([bodyMd5(bodyInFile('set_programme_week_one', file0167)), bodyMd5(bodyInFile('set_programme_week_one'))]);
    expect(latest('set_programme_week_one').file).toBe(file);

    const apply = guardRows.find((r) => r.name === 'apply_programme_rollout');
    expect(apply?.from).toBe('0130');
    expect(apply?.accepted).toEqual([bodyMd5(bodyInFile('apply_programme_rollout', file0130)), bodyMd5(bodyInFile('apply_programme_rollout'))]);
    const defining = (fn: string) =>
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith('.sql'))
        .sort()
        .filter((f) => new RegExp(`create\\s+(or\\s+replace\\s+)?function\\s+(public\\.)?${fn}\\s*\\(`, 'i').test(read(f)));
    // 0130's is the latest before this file's, and 0133's the only schedule_programme_rollout before it
    expect(defining('apply_programme_rollout')).toEqual(['0094_programme_rollouts.sql', '0130_gym_scoping_and_permission_checks.sql', file]);
    expect(defining('schedule_programme_rollout')).toEqual(['0133_credits_rollouts_imports_groups.sql', file]);
    expect(defining('set_programme_week_one').slice(-2)).toEqual(['0167_programme_rollout_updates.sql', file]);

    // the six-argument schedule_programme_rollout is 0133's, and goes (this file's has the length)
    const old = guardRows.find((r) => r.name === 'schedule_programme_rollout' && r.args.endsWith('boolean'));
    expect(old?.from).toBe('0133');
    expect(old?.accepted).toEqual([bodyMd5(bodyInFile('schedule_programme_rollout', file0133))]);
    expect(migrationCode).toContain('drop function if exists public.schedule_programme_rollout(uuid, text, date, text, uuid[], boolean);');
    expect(fns.filter((f) => f.name === 'schedule_programme_rollout').map((f) => f.key)).toEqual([
      'schedule_programme_rollout(uuid,text,date,text,uuid[],boolean,integer)',
    ]);
  });

  it('replaces no other function from an earlier migration', () => {
    const earlier = new Set(fns.filter((f) => f.file !== file).map((f) => f.name));
    for (const name of created) expect(earlier.has(name)).toBe(false);
    for (const untouched of ['apply_due_programme_rollouts', 'instantiate_template_core', 'apply_template_to_rollout', 'programme_rollout_usage', '_rollout_live_copies']) {
      expect(latest(untouched).file).not.toBe(file);
    }
  });

  it('can run twice: tables, columns, the rule on weeks, rules and triggers are created only if missing or dropped first, and nothing temporary', () => {
    expect(migrationCode).toMatch(/create table if not exists gym_programme_waiting/);
    for (const column of ['ended_at', 'ended_by', 'weeks']) expect(migrationCode).toContain(`add column if not exists ${column} `);
    expect(migrationCode).toMatch(
      /alter table programme_rollouts drop constraint if exists programme_rollouts_weeks_check;\s*alter table programme_rollouts add constraint programme_rollouts_weeks_check/
    );
    expect(migrationCode).toMatch(/drop trigger if exists client_profiles_gym_programme on client_profiles;\s*create trigger client_profiles_gym_programme/);
    expect(migrationCode).toMatch(
      /drop trigger if exists program_templates_refuse_gym_programme_delete on program_templates;\s*create trigger program_templates_refuse_gym_programme_delete/
    );
    for (const m of migrationCode.matchAll(/create policy "([^"]+)"/g)) {
      expect(migrationCode).toContain(`drop policy if exists "${m[1]}"`);
    }
    // the backfills only touch rows not done yet
    expect(squeeze(migrationCode)).toContain("where r.audience = 'all' and r.weeks is null;");
    expect(squeeze(migrationCode)).toContain("where o.audience = 'all' and o.applied_at is not null and o.ended_at is null");
    expect(migrationCode).not.toMatch(/\btemp(orary)?\s+table\b/i);
    expect(migrationCode).toMatch(/notify pgrst, 'reload schema';\s*$/);
  });
});

describe('the length is fixed when it starts', () => {
  it('a start for everyone has 1 to 12 weeks; one for chosen members has none', () => {
    expect(squeeze(migrationCode)).toContain(
      "check ((audience = 'all' and weeks is not null and weeks between 1 and 12) or (audience <> 'all' and weeks is null))"
    );
    // the constraint is added after the backfill gives every start for everyone its weeks
    expect(migrationCode.indexOf('set weeks = greatest(1, least(12,')).toBeLessThan(migrationCode.indexOf('add constraint programme_rollouts_weeks_check'));
  });

  it('existing starts for everyone get their template’s weeks now (1 to 12; a template with no workouts counts as one week)', () => {
    expect(squeeze(migrationCode)).toContain(
      'update programme_rollouts r set weeks = greatest(1, least(12, coalesce((select max(d.week_num) from program_template_days d where d.template_id = r.template_id), 1)))'
    );
  });

  it('Start a programme takes the length, or the template’s weeks when none is sent (the app before this deploy)', () => {
    const schedule = squeeze(code('schedule_programme_rollout'));
    expect(latest('schedule_programme_rollout').file).toBe(file);
    expect(squeeze(latest('schedule_programme_rollout').args)).toContain('p_starts_now boolean, p_weeks integer default null');
    expect(schedule).toContain(
      "if p_audience = 'all' then if p_weeks is null then select greatest(1, least(12, coalesce(max(d.week_num), 1))) into v_weeks from program_template_days d where d.template_id = p_template_id; elsif p_weeks < 1 or p_weeks > 12 then raise exception 'Choose a length of 1 to 12 weeks.'; else v_weeks := p_weeks; end if; end if;"
    );
    expect(schedule).toContain(
      'insert into programme_rollouts (gym_id, template_id, program_name, start_date, audience, client_ids, created_by, weeks) values (v_gym, p_template_id, v_name, p_start, p_audience, v_ids, auth.uid(), v_weeks)'
    );
    // after the template is found at the coach's gym, and everything else as in 0133
    expect(schedule.indexOf('v_template.gym_id is distinct from v_gym')).toBeLessThan(schedule.indexOf('into v_weeks'));
    const before = squeeze(bodyInFile('schedule_programme_rollout', file0133).replace(/--.*$/gm, '')).trim();
    const withoutLength = schedule
      .replace(' v_weeks integer;', '')
      .replace(/ if p_audience = 'all' then if p_weeks is null then .*? end if; end if;/, '')
      .replace(', weeks)', ')')
      .replace(', v_weeks)', ')')
      .trim();
    expect(withoutLength).toBe(before);
    expect(access(latest('schedule_programme_rollout'))).toEqual({ anon: false, authenticated: true });
    expect(latest('schedule_programme_rollout').securityDefiner).toBe(true);
    expect(latest('schedule_programme_rollout').searchPath).toBe('public');
  });

  it('the last day comes from the rollout’s own weeks, never from its template', () => {
    for (const name of ['_gym_programme_today', 'gym_programmes', 'program_templates_refuse_gym_programme_delete', 'change_gym_programme', '_give_gym_programme']) {
      expect(code(name)).not.toMatch(/program_template_days/);
    }
    expect(squeeze(code('_gym_programme_today'))).toContain(`and t.today <= ${lastDayFrom('x', 'w.week_one')}`);
    expect(squeeze(code('_gym_programme_today'))).toContain('r.week_one + 7 * r.weeks - 1, t.today');
    expect(squeeze(code('gym_programmes'))).toContain(`and t.today <= ${lastDayFrom('x', 'xw.week_one')}`);
    expect(squeeze(code('program_templates_refuse_gym_programme_delete'))).toContain(
      `r.start_date - (extract(isodow from r.start_date)::integer - 1) + 7 * r.weeks - 1 as last_day`
    );
  });

  it('nothing is left of the machinery the template-led length needed: no template-days trigger, no locks, no reopening', () => {
    expect(migration).not.toMatch(/program_template_days_refuse_gym_programme_shorten/);
    expect(migrationCode).not.toMatch(/on program_template_days/);
    expect(migrationCode).not.toMatch(/gym-programme-change|gym-programme-template-days/);
    // the only lock left is giving a member a copy, one at a time per member
    expect(migrationCode.match(/pg_advisory_xact_lock/g)).toHaveLength(1);
    expect(code('_give_gym_programme')).toContain("pg_advisory_xact_lock(hashtext('gym-programme:' || p_client_id::text))");
    expect(code('program_templates_refuse_gym_programme_delete')).not.toMatch(/\bupdate\b/);
    expect(migration).not.toMatch(/end_gym_programme/);
  });

  it('only a gym admin changes it: change_gym_programme ends it now or gives it 1 to 12 weeks, and a length before today ends it today', () => {
    const change = squeeze(code('change_gym_programme'));
    expect(change).toMatch(/if auth\.uid\(\) is null or v_gym is null then raise exception/);
    // one change at a time
    expect(change).toContain('select * into v_r from programme_rollouts where id = p_rollout_id for update;');
    expect(change).toContain("if v_r.id is null or v_r.gym_id is distinct from v_gym or v_r.audience <> 'all' then raise exception 'Gym programme not found';");
    expect(change).toContain("if not public.is_admin_of_gym(v_r.gym_id) then raise exception 'Only a gym admin can end a gym programme or change its length.';");
    // never opened again, nor changed once its last day has passed
    expect(change).toContain('if v_r.ended_at is not null then raise exception');
    expect(change).toContain('v_started := v_r.applied_at is not null and v_r.start_date <= v_today;');
    expect(change).toContain('if v_started and v_today > v_week_one + 7 * v_r.weeks - 1 then raise exception');
    // end: only once it has started (a scheduled start is cancelled instead)
    expect(change).toContain(
      "if coalesce(p_end, false) then if not v_started then raise exception 'It hasn''t started yet: cancel the scheduled start instead.'; end if; update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_r.id; return 'ended'; end if;"
    );
    expect(change).toContain("if p_weeks is null or p_weeks < 1 or p_weeks > 12 then raise exception 'Choose a length of 1 to 12 weeks.';");
    expect(change).toContain(
      "if v_started and v_week_one + 7 * p_weeks - 1 < v_today then update programme_rollouts set weeks = (v_today - v_week_one) / 7 + 1, ended_at = now(), ended_by = auth.uid() where id = v_r.id; return 'ended'; end if; update programme_rollouts set weeks = p_weeks where id = v_r.id; return 'changed';"
    );
    expect(code('change_gym_programme')).toContain("v_week_one := v_r.start_date - (extract(isodow from v_r.start_date)::integer - 1);");
  });
});

describe('who can do what (Row Level Security and function access)', () => {
  it('the waiting list has Row Level Security and no rules: only the functions read and write it', () => {
    expect(migrationCode).toMatch(/alter table gym_programme_waiting enable row level security/);
    const rules = replayPolicies().get('gym_programme_waiting');
    expect(rules === undefined || rules.size === 0).toBe(true);
  });

  it('coaches can no longer change a rollout straight through the API (its length or end included): read their gym’s, and cancel one not given out yet', () => {
    const rules = replayPolicies().get('programme_rollouts');
    expect(rules && Object.fromEntries(rules)).toEqual({
      'gym coaches read programme_rollouts': 'select',
      'gym coaches cancel scheduled programme_rollouts': 'delete',
    });
    // One for everyone at the gym only by a gym admin, as starting (0133) and changing one are.
    expect(squeeze(migrationCode)).toContain(
      "on programme_rollouts for delete using (gym_id = public.my_gym_id() and applied_at is null and (audience <> 'all' or public.is_admin_of_gym(gym_id)))"
    );
  });

  it('the internal functions and the trigger function cannot be called by anyone signed in; the coach functions only when signed in', () => {
    for (const name of ['_gym_programme_today', '_give_gym_programme', 'client_profiles_join_gym_programme', 'program_templates_refuse_gym_programme_delete']) {
      expect(access(latest(name))).toEqual({ anon: false, authenticated: false });
    }
    for (const name of ['gym_programmes', 'change_gym_programme', 'resolve_gym_programme_waiting', 'apply_programme_rollout']) {
      expect(access(latest(name))).toEqual({ anon: false, authenticated: true });
    }
    for (const name of [...created, 'apply_programme_rollout']) {
      expect(latest(name).securityDefiner).toBe(true);
      expect(latest(name).searchPath).toBe('public');
    }
  });

  it('the coach functions refuse anyone who is not a coach at the gym (my_gym_id is empty for members)', () => {
    for (const name of ['gym_programmes', 'change_gym_programme', 'resolve_gym_programme_waiting']) {
      expect(code(name)).toMatch(/if auth\.uid\(\) is null or v_gym is null then\s+raise exception/);
    }
    expect(code('resolve_gym_programme_waiting')).toMatch(/v_r\.gym_id is distinct from v_gym or v_r\.audience <> 'all'/);
  });

  it('a waiting member is decided by their own coach or a gym admin, at the member’s gym', () => {
    const body = code('resolve_gym_programme_waiting');
    expect(body).toMatch(/public\.client_gym_id\(p_client_id\) is distinct from v_gym/);
    expect(body).toMatch(/not coalesce\(public\.is_coach_of\(p_client_id\), false\)/);
    expect(body).toMatch(/_give_gym_programme\(p_rollout_id, p_client_id, true\)/);
  });

  it('deleting a template can’t cancel a start for everyone or end the gym programme: only a gym admin can delete one that would', () => {
    // a template's rollouts go with it, past the rules on programme_rollouts
    expect(read('0094_programme_rollouts.sql')).toMatch(/template_id uuid not null references program_templates\(id\) on delete cascade/);
    expect(squeeze(migrationCode)).toContain(
      'before delete on program_templates for each row execute function public.program_templates_refuse_gym_programme_delete()'
    );
    const guard = squeeze(code('program_templates_refuse_gym_programme_delete'));
    // nobody signed in (the SQL editor, the service role) deletes as before; a gym admin of the rollout's gym is never refused
    expect(guard).toContain('if auth.uid() is null then return old; end if;');
    expect(guard).toContain("where r.template_id = old.id and r.audience = 'all' order by r.start_date loop continue when public.is_admin_of_gym(v_r.gym_id);");
    // two refusals: not started yet (scheduled, or given out ahead of its start date), or its last day not passed, ended or not
    expect(guard.match(/raise exception/g)).toHaveLength(2);
    expect(guard).toContain('if v_r.applied_at is null or v_r.start_date > v_r.today then raise exception');
    expect(guard).toContain('if v_r.today <= v_r.last_day then raise exception');
    expect(guard).toContain("public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) as today");
  });

  it('a start for everyone is given out early by nobody: apply_programme_rollout, signed in, is a gym admin’s for everyone and never before the start date', () => {
    const apply = squeeze(code('apply_programme_rollout'));
    const before = squeeze(bodyInFile('apply_programme_rollout', file0130).replace(/--.*$/gm, ''));
    // as 0130 up to "already given out", then the new checks, then as 0130 to "given out", then the take-over below
    const head = before.slice(0, before.indexOf('for v_client in'));
    const loop = before.slice(before.indexOf('for v_client in'), before.indexOf('return v_count;'));
    expect(apply.replace(' v_today date;', '')).toContain(head.trim());
    expect(apply).toContain(loop.trim());
    expect(apply).toMatch(/ return v_count; end;\s*$/);
    expect(apply).toContain(
      "if v_r.applied_at is not null then return 0; end if; select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) into v_today from gyms g where g.id = v_r.gym_id; if auth.uid() is not null then if v_r.audience = 'all' and not exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin) then raise exception 'Only a gym admin can start a programme for everyone.'; end if; if v_today is null or v_r.start_date > v_today then raise exception"
    );
    // all of it only when signed in: the daily job (nobody signed in) gives a later start out on its day, as before
    expect(code('apply_due_programme_rollouts')).toMatch(/if auth\.uid\(\) is not null then\s+raise exception 'Not authorized'/);
    expect(squeeze(code('apply_due_programme_rollouts'))).toContain('pr.start_date <= (now() at time zone g.timezone)::date');
    // the same admin check and the same today as Start a programme, which calls it to start now: nothing new is refused for a start today
    expect(code('schedule_programme_rollout')).toMatch(/v_admin := exists \(select 1 from profiles where id = auth\.uid\(\) and is_gym_admin\)/);
    expect(code('schedule_programme_rollout')).toMatch(/v_today := public\.local_date\(v_tz\)/);
    expect(squeeze(code('schedule_programme_rollout'))).toContain('if coalesce(p_starts_now, false) then v_count := public.apply_programme_rollout(v_id);');
  });
});

describe('which programme a gym is on', () => {
  const today = squeeze(code('_gym_programme_today'));

  it('is the newest start for everyone given out, started, not ended and within its weeks', () => {
    expect(today).toContain(
      "where x.gym_id = g.id and x.audience = 'all' and x.applied_at is not null and x.ended_at is null and x.start_date <= t.today and t.today <= w.week_one + 7 * x.weeks - 1 order by x.start_date desc, x.created_at desc limit 1"
    );
  });

  it('counts week 1 from the Monday of its start date, as week_one does (0167)', () => {
    expect(today).toContain('x.start_date - (extract(isodow from x.start_date)::integer - 1) as week_one');
    expect(code('set_programme_week_one')).toContain('new.start_date - (extract(isodow from new.start_date)::integer - 1)');
  });

  it('a newer one given out ends every older one still open, so an older one is never the gym’s programme again', () => {
    const apply = squeeze(code('apply_programme_rollout'));
    const takeOver = apply.slice(apply.indexOf('update programme_rollouts set applied_at = now() where id = v_r.id;'));
    expect(takeOver).toContain(
      "if v_r.audience = 'all' then update programme_rollouts x set ended_at = now(), ended_by = auth.uid() where x.gym_id = v_r.gym_id and x.audience = 'all' and x.id <> v_r.id and x.applied_at is not null and x.ended_at is null and (x.start_date < v_r.start_date or (x.start_date = v_r.start_date and x.created_at < v_r.created_at));"
    );
    // ordered as _gym_programme_today orders them (start date, then created)
    expect(today).toContain('order by x.start_date desc, x.created_at desc');
    // one older than a gym programme that has already started can never be the gym's programme: it ends straight away
    expect(takeOver).toContain(
      "if exists ( select 1 from programme_rollouts x where x.gym_id = v_r.gym_id and x.audience = 'all' and x.id <> v_r.id and x.applied_at is not null and x.start_date <= v_today and (x.start_date > v_r.start_date or (x.start_date = v_r.start_date and x.created_at > v_r.created_at)) ) then update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_r.id; end if; end if; return v_count;"
    );
  });

  it('existing ones: each older one given out is ended as of the next one’s start date (midnight at its gym)', () => {
    const backfill = squeeze(migrationCode.slice(migrationCode.indexOf('update programme_rollouts r\nset ended_at = nx.ends')));
    expect(backfill).toContain('select n.start_date::timestamp at time zone coalesce(nullif(g.timezone, \'\'), \'UTC\') from programme_rollouts n');
    expect(backfill).toContain(
      "where n.gym_id = o.gym_id and n.audience = 'all' and n.applied_at is not null and n.id <> o.id and (n.start_date > o.start_date or (n.start_date = o.start_date and n.created_at > o.created_at)) and n.start_date <= public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) order by n.start_date, n.created_at limit 1"
    );
    expect(backfill).toContain('where r.id = nx.id and nx.ends is not null;');
  });

  it('the template list shows the gym’s programme, or when it has none the newest one that has ended within its weeks', () => {
    const list = squeeze(code('gym_programmes'));
    expect(list).toContain(
      "where x.gym_id = g.id and x.audience = 'all' and x.applied_at is not null and x.start_date <= t.today and t.today <= xw.week_one + 7 * x.weeks - 1 order by (x.ended_at is null) desc, x.start_date desc, x.created_at desc limit 1"
    );
    expect(list).toContain('r.ended_at is null, r.ended_at,');
    // waiting members only to their coach or a gym admin, and only while it is the gym's programme
    expect(list).toMatch(/\(v_admin or coalesce\(public\.is_coach_of\(q\.client_id\), false\)\)/);
    expect(list).toContain('and r.ended_at is null and public.client_gym_id(q.client_id) is not distinct from v_gym');
  });

  it('a late joiner’s copy keeps the gym’s week 1 when a coach moves its start date; every other copy as in 0167', () => {
    const trigger = squeeze(code('set_programme_week_one'));
    expect(trigger).toContain(
      "if (new.rollout_id is not null or (tg_op = 'UPDATE' and old.week_one is not null)) and new.start_date is not null and ((tg_op = 'INSERT' and new.week_one is null) or (tg_op = 'UPDATE' and new.start_date is distinct from old.start_date)) then"
    );
    expect(read('0094_programme_rollouts.sql')).toMatch(/rollout_id uuid references programme_rollouts\(id\) on delete set null/);
    expect(trigger).toContain(
      "if tg_op = 'UPDATE' and old.week_one is not null and old.start_date is not null and old.week_one < old.start_date - (extract(isodow from old.start_date)::integer - 1) and new.start_date >= old.week_one and new.start_date <= old.week_one + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = new.id), 0), 1) - 1 then new.week_one := old.week_one; else new.week_one := new.start_date - (extract(isodow from new.start_date)::integer - 1); end if;"
    );
    // still fired by 0167's trigger, which this migration leaves as it is
    expect(migrationCode).not.toMatch(/trigger workout_programs_week_one/);
  });
});

describe('giving it to a member who joins later', () => {
  const give = squeeze(code('_give_gym_programme'));

  it('only for the programme their own gym is on today', () => {
    expect(give).toContain('v_gym uuid := public.client_gym_id(p_client_id)');
    expect(give).toContain("select * into v_g from public._gym_programme_today(v_gym); if v_g.rollout_id is null or v_g.rollout_id is distinct from p_rollout_id then return 'closed'");
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
    expect(give).toMatch(/if coalesce\(p_force, false\) then .* else .*select wp\.id into v_other/);
  });

  it('"Give it to them" moves a programme of theirs that would take over part-way to the Monday after the gym programme', () => {
    expect(give).toContain(
      'if coalesce(p_force, false) then update workout_programs wp set start_date = v_g.last_day + 1 where wp.client_id = p_client_id and wp.start_date is not null and wp.rollout_id is distinct from p_rollout_id and wp.start_date >= v_g.today and wp.start_date <= v_g.last_day; else'
    );
    expect(give.indexOf('set start_date = v_g.last_day + 1')).toBeGreaterThan(give.indexOf("return 'has_it'"));
    expect(give.indexOf('set start_date = v_g.last_day + 1')).toBeLessThan(give.indexOf('instantiate_template_core'));
    // the coach list names every programme of theirs it moves, picked as the update above picks them
    const list = squeeze(code('gym_programmes'));
    expect(list).toContain("'other_starts', op.start_date");
    expect(list).toContain("'other_program_id', op.id");
    expect(list).toContain(
      "'moves', ( select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'starts', x.start_date) order by x.start_date, x.created_at), '[]'::jsonb) from workout_programs x where x.client_id = q.client_id and x.start_date is not null and x.rollout_id is distinct from r.id and x.start_date >= r.today and x.start_date <= r.last_day)"
    );
  });

  it('starts today on the gym’s current week, from the template as it is now: the copy’s week 1 is the gym programme’s Monday', () => {
    expect(give).toContain('public.instantiate_template_core(v_g.template_id, p_client_id, v_g.program_name, v_g.today, p_rollout_id)');
    expect(give).toContain('update workout_programs set week_one = v_g.week_one where id = v_program.id');
  });

  it('happens when a member finishes setting up their profile, once, and never stops that save', () => {
    expect(squeeze(migrationCode)).toContain(
      'after insert or update of onboarding_completed_at on client_profiles for each row execute function public.client_profiles_join_gym_programme()'
    );
    const trigger = squeeze(code('client_profiles_join_gym_programme'));
    expect(trigger).toContain("if new.onboarding_completed_at is null or (tg_op = 'UPDATE' and old.onboarding_completed_at is not null) then return null");
    expect(trigger).toContain('select * into v_g from public._gym_programme_today(v_gym); if v_g.rollout_id is null then return null;');
    expect(trigger).toContain('_give_gym_programme(v_g.rollout_id, new.client_id, false)');
    expect(trigger).toMatch(/exception when others then begin insert into gym_programme_waiting .* 'failed'/);
    expect(trigger).toMatch(/exception when others then null; end;/);
  });
});
