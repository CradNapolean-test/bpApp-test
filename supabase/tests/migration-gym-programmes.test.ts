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

const guardRows = [...migration.matchAll(/\('(\w+)', '(\d{4})', array\[([^\]]*)\]\)/g)].map((m) => ({
  name: m[1],
  from: m[2],
  accepted: [...m[3].matchAll(/'([0-9a-f]{32})'/g)].map((a) => a[1]),
}));

const created = [
  '_gym_programme_today',
  '_give_gym_programme',
  'client_profiles_join_gym_programme',
  'gym_programmes',
  'end_gym_programme',
  'resolve_gym_programme_waiting',
  'program_templates_refuse_gym_programme_delete',
  'program_template_days_refuse_gym_programme_shorten',
];
// Replaced from an earlier migration (the one named in its guard row).
const replaced = ['set_programme_week_one', 'apply_programme_rollout'];
const file0167 = fs.readFileSync(path.resolve(__dirname, '../migrations', '0167_programme_rollout_updates.sql'), 'utf8').replace(/\r\n/g, '\n');
const file0130 = fs
  .readFileSync(path.resolve(__dirname, '../migrations', '0130_gym_scoping_and_permission_checks.sql'), 'utf8')
  .replace(/\r\n/g, '\n');
// Bodies from earlier copies of this file, which may already be in the database: the copy handed out on 20 Nov 2026 (gym_programmes,
// set_programme_week_one), a later one (the template-delete trigger, set_programme_week_one) and the one of 21 Nov that added the
// template-days trigger (the template-delete trigger). Each has the same arguments and result as today's, so this file replaces it in
// place. Worked out from those copies' text as bodyMd5 does.
const earlierCopies: Record<string, string[]> = {
  gym_programmes: ['662073fea310d8827b69bac083e593f6'],
  program_templates_refuse_gym_programme_delete: ['e417964f898305816cc6a55ad7148e23', '8376186b3cf14c0b6d24d762c0e36f8e'],
  program_template_days_refuse_gym_programme_shorten: ['4eb2b9bf86c808d575cbe70b02c3a3fe'],
  set_programme_week_one: ['8a258730266312d0344c534b09087221', '836a65083143b6a9bf93df50b68a7bec'],
};

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
    expect(guardRows.map((r) => r.name).sort()).toEqual([...created, ...replaced].sort());
    for (const row of guardRows.filter((r) => created.includes(r.name))) {
      expect(row.from).toBe('0172');
      expect(row.accepted).toEqual([bodyMd5(bodyInFile(row.name)), ...(earlierCopies[row.name] ?? [])]);
    }
    // a function that does not exist yet passes; one that exists with another body stops the migration
    expect(migration).toMatch(/if v_md5 is not null and not \(v_md5 = any \(v_check\.accepted\)\) then/);
  });

  it('can be run over an earlier copy of this file: their bodies are accepted, and none is today’s', () => {
    for (const [name, md5s] of Object.entries(earlierCopies)) {
      expect(guardRows.find((r) => r.name === name)?.accepted).toEqual(expect.arrayContaining(md5s));
      expect(md5s).not.toContain(bodyMd5(bodyInFile(name)));
    }
  });

  it('the functions it replaces must be the earlier migration’s or this file’s', () => {
    const row = guardRows.find((r) => r.name === 'set_programme_week_one');
    expect(row?.from).toBe('0167');
    expect(row?.accepted).toEqual([
      bodyMd5(bodyInFile('set_programme_week_one', file0167)),
      bodyMd5(bodyInFile('set_programme_week_one')),
      ...earlierCopies.set_programme_week_one,
    ]);
    expect(latest('set_programme_week_one').file).toBe(file);

    const apply = guardRows.find((r) => r.name === 'apply_programme_rollout');
    expect(apply?.from).toBe('0130');
    expect(apply?.accepted).toEqual([bodyMd5(bodyInFile('apply_programme_rollout', file0130)), bodyMd5(bodyInFile('apply_programme_rollout'))]);
    // 0130's is the latest before this file's
    const dir = path.resolve(__dirname, '../migrations');
    const defining = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
      .filter((f) => /create\s+(or\s+replace\s+)?function\s+(public\.)?apply_programme_rollout\s*\(/i.test(fs.readFileSync(path.join(dir, f), 'utf8')));
    expect(defining).toEqual(['0094_programme_rollouts.sql', '0130_gym_scoping_and_permission_checks.sql', file]);
    expect(latest('apply_programme_rollout').file).toBe(file);
  });

  it('replaces no other function from an earlier migration', () => {
    const earlier = new Set(fns.filter((f) => f.file !== file).map((f) => f.name));
    for (const name of created) expect(earlier.has(name)).toBe(false);
    for (const untouched of ['apply_due_programme_rollouts', 'schedule_programme_rollout', 'instantiate_template_core', 'apply_template_to_rollout', 'programme_rollout_usage']) {
      expect(latest(untouched).file).not.toBe(file);
    }
  });

  it('can run twice: tables, columns, rules and the trigger are created only if missing or dropped first, and nothing temporary', () => {
    expect(migrationCode).toMatch(/create table if not exists gym_programme_waiting/);
    expect(migrationCode).toMatch(/add column if not exists ended_at/);
    expect(migrationCode).toMatch(/add column if not exists ended_by/);
    expect(migrationCode).toMatch(/drop trigger if exists client_profiles_gym_programme on client_profiles;\s*create trigger client_profiles_gym_programme/);
    expect(migrationCode).toMatch(
      /drop trigger if exists program_templates_refuse_gym_programme_delete on program_templates;\s*create trigger program_templates_refuse_gym_programme_delete/
    );
    expect(migrationCode).toMatch(
      /drop trigger if exists program_template_days_refuse_gym_programme_shorten on program_template_days;\s*create trigger program_template_days_refuse_gym_programme_shorten/
    );
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
    for (const name of [
      '_gym_programme_today',
      '_give_gym_programme',
      'client_profiles_join_gym_programme',
      'program_templates_refuse_gym_programme_delete',
      'program_template_days_refuse_gym_programme_shorten',
    ]) {
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

  it('deleting a template can’t cancel a start for everyone or end the gym programme: only a gym admin can delete one that would', () => {
    // a template's rollouts go with it, past the rules on programme_rollouts
    const fk = fs.readFileSync(path.resolve(__dirname, '../migrations', '0094_programme_rollouts.sql'), 'utf8');
    expect(fk).toMatch(/template_id uuid not null references program_templates\(id\) on delete cascade/);
    expect(squeeze(migrationCode)).toContain(
      'before delete on program_templates for each row execute function public.program_templates_refuse_gym_programme_delete()'
    );
    const guard = squeeze(code('program_templates_refuse_gym_programme_delete'));
    // nobody signed in (the SQL editor, the service role) deletes as before; a gym admin of the rollout's gym is never refused
    expect(guard).toContain('if auth.uid() is null then return old; end if;');
    expect(guard).toContain("select r.* from programme_rollouts r where r.template_id = old.id and r.audience = 'all'");
    expect(guard).toContain('v_admin := public.is_admin_of_gym(v_r.gym_id);');
    // each of its three refusals is for someone who isn't a gym admin there
    expect(guard.match(/raise exception/g)).toHaveLength(3);
    expect(guard.match(/if not v_admin\b/g)).toHaveLength(3);
    // not started yet: scheduled, or given out ahead of its start date
    expect(guard).toMatch(/if not v_admin and \(v_r\.applied_at is null or v_r\.start_date > v_today\) then raise exception/);
    // the gym's programme until its last week is over, ended or not (as gym_programmes() shows it): picked as _gym_programme_today picks it,
    // with its last day counted the same way
    expect(guard).toContain(
      "v_cur_id := null; v_cur_last := null; select x.id, x.start_date - (extract(isodow from x.start_date)::integer - 1) + 7 * tw.weeks - 1 into v_cur_id, v_cur_last from programme_rollouts x"
    );
    expect(guard).toContain(
      "where x.gym_id = v_r.gym_id and x.audience = 'all' and x.applied_at is not null and x.start_date <= v_today and exists (select 1 from program_templates t where t.id = x.template_id) order by x.start_date desc, x.created_at desc limit 1; continue when v_cur_id is distinct from v_r.id;"
    );
    expect(squeeze(code('_gym_programme_today'))).toContain(
      "x.audience = 'all' and x.applied_at is not null and x.start_date <= t.today order by x.start_date desc, x.created_at desc limit 1"
    );
    expect(squeeze(code('_gym_programme_today'))).toContain('w.week_one + 7 * tw.weeks - 1');
    expect(guard).toMatch(/if not v_admin and v_today <= v_cur_last then raise exception/);
    // without it, the gym's programme before it would be picked again (as _gym_programme_today picks), worked out afresh for each rollout
    expect(guard).toContain('v_prev_id := null; v_prev_name := null; v_reopens := false; select x.id, x.program_name,');
    expect(guard).toContain(
      "where x.gym_id = v_r.gym_id and x.audience = 'all' and x.applied_at is not null and x.start_date <= v_today and x.template_id <> old.id and exists (select 1 from program_templates t where t.id = x.template_id) order by x.start_date desc, x.created_at desc limit 1"
    );
    // a template's rollouts only go at the end of the delete (the cascade), so both picks leave out a rollout whose template is already
    // gone: several templates deleted in one request are decided as if one after the other, in any order
    expect(guard.match(/and exists \(select 1 from program_templates t where t\.id = x\.template_id\)/g)).toHaveLength(2);
    // and one delete at a time per gym, locked before anything is read, so two requests at once are decided one after the other
    expect(guard).toContain(
      "if auth.uid() is null then return old; end if; perform pg_advisory_xact_lock(hashtext('gym-programme-change:' || old.gym_id::text)); for v_r in select r.* from programme_rollouts r"
    );
    expect(guard).toContain(
      "if v_r.gym_id is distinct from old.gym_id then perform pg_advisory_xact_lock(hashtext('gym-programme-change:' || v_r.gym_id::text)); end if; v_admin :="
    );
    expect(guard).not.toContain('_gym_programme_today');
    expect(guard).toContain('x.ended_at is null and tw.weeks > 0 and v_today <= x.start_date - (extract(isodow from x.start_date)::integer - 1) + 7 * tw.weeks - 1');
    // while that one is open: refused, or for a gym admin it ends with this one, so an older gym programme is never opened again
    expect(guard).toContain('if coalesce(v_reopens, false) then if not v_admin then raise exception');
    expect(guard).toContain(
      'end if; update programme_rollouts set ended_at = now(), ended_by = auth.uid() where id = v_prev_id and ended_at is null; end if; end loop; return old; end;'
    );
  });

  it('taking the last week off the gym programme’s template is a gym admin’s to do, since it ends the gym programme sooner', () => {
    // after the whole statement (deleteTemplateWeek's renumbering, a bulk delete), on a delete or a change of week or template only
    expect(squeeze(migrationCode)).toContain(
      'after update of week_num, template_id or delete on program_template_days for each row execute function public.program_template_days_refuse_gym_programme_shorten()'
    );
    const shorten = squeeze(code('program_template_days_refuse_gym_programme_shorten'));
    // nobody signed in as before; a day staying in its template on the same or a later week changes nothing
    expect(shorten).toContain(
      "if auth.uid() is null or (tg_op = 'UPDATE' and new.template_id = old.template_id and new.week_num >= old.week_num) then return null; end if;"
    );
    // a template being deleted is the template trigger's to decide
    expect(shorten).toContain('if not exists (select 1 from program_templates t where t.id = old.template_id) then return null; end if;');
    // the template lost its last week: its last week now is before the week the day was in (as _gym_programme_today counts weeks)
    expect(shorten).toContain(
      'select coalesce(max(d.week_num), 0)::integer into v_weeks from program_template_days d where d.template_id = old.template_id; if v_weeks >= old.week_num then return null; end if;'
    );
    // counted only after changes to the days of a template given out for everyone wait for each other, so two requests at once that each
    // take one workout of the last week off can't both pass; locked per template (not the gym's lock the template-delete trigger holds while
    // its delete takes the days with it), so deleting a week and deleting the template at once can't deadlock
    expect(shorten).toContain(
      "if not exists ( select 1 from programme_rollouts r where r.template_id = old.template_id and r.audience = 'all' and r.applied_at is not null ) then return null; end if; perform pg_advisory_xact_lock(hashtext('gym-programme-template-days:' || old.template_id::text)); select coalesce(max(d.week_num), 0)::integer into v_weeks"
    );
    expect(shorten.indexOf('pg_advisory_xact_lock')).toBeLessThan(shorten.indexOf('max(d.week_num)'));
    expect(squeeze(code('_gym_programme_today'))).toContain('select coalesce(max(d.week_num), 0)::integer as weeks from program_template_days d where d.template_id = r.template_id');
    // refused, unless a gym admin, while it is the gym's programme and its last week (before this change) is not over, ended or not
    expect(shorten).toContain(
      "select r.* from programme_rollouts r where r.template_id = old.template_id and r.audience = 'all' and r.applied_at is not null"
    );
    expect(shorten).toContain(
      'continue when public.is_admin_of_gym(v_r.gym_id); select * into v_g from public._gym_programme_today(v_r.gym_id); continue when v_g.rollout_id is distinct from v_r.id; if v_g.today <= v_g.week_one + 7 * old.week_num - 1 then raise exception'
    );
  });

  it('a start for everyone is given out early by nobody: apply_programme_rollout, signed in, is a gym admin’s for everyone and never before the start date', () => {
    const apply = squeeze(code('apply_programme_rollout'));
    const before = squeeze(bodyInFile('apply_programme_rollout', file0130).replace(/--.*$/gm, ''));
    // as 0130 up to "already given out", then the new checks, then as 0130 to the end
    const head = before.slice(0, before.indexOf('for v_client in'));
    const tail = before.slice(before.indexOf('for v_client in'));
    expect(apply.replace(' v_today date;', '')).toContain(head.trim());
    expect(apply).toContain(tail.trim());
    expect(apply).toContain(
      "if v_r.applied_at is not null then return 0; end if; if auth.uid() is not null then if v_r.audience = 'all' and not exists (select 1 from profiles p where p.id = auth.uid() and p.is_gym_admin) then raise exception 'Only a gym admin can start a programme for everyone.'; end if;"
    );
    // the gym's today, as schedule_programme_rollout counts it; a missing gym is refused too
    expect(apply).toContain(
      "select public.local_date(coalesce(nullif(g.timezone, ''), 'UTC')) into v_today from gyms g where g.id = v_r.gym_id; if v_today is null or v_r.start_date > v_today then raise exception"
    );
    // all of it only when signed in: the daily job (nobody signed in) gives a later start out on its day, as before
    expect(apply.indexOf('if auth.uid() is not null then')).toBeLessThan(apply.indexOf("v_r.audience = 'all' and not exists"));
    expect(code('apply_due_programme_rollouts')).toMatch(/if auth\.uid\(\) is not null then\s+raise exception 'Not authorized'/);
    // the same admin check and the same today as Start a programme, which calls it to start now: nothing new is refused for a start today
    expect(code('schedule_programme_rollout')).toMatch(/v_admin := exists \(select 1 from profiles where id = auth\.uid\(\) and is_gym_admin\)/);
    expect(code('schedule_programme_rollout')).toMatch(/v_today := public\.local_date\(v_tz\)/);
    expect(squeeze(code('schedule_programme_rollout'))).toContain('if coalesce(p_starts_now, false) then v_count := public.apply_programme_rollout(v_id);');
    // still callable by coaches (Start a programme calls it as the coach), never by anon
    expect(access(latest('apply_programme_rollout'))).toEqual({ anon: false, authenticated: true });
    expect(latest('apply_programme_rollout').securityDefiner).toBe(true);
    expect(latest('apply_programme_rollout').searchPath).toBe('public');
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

  it('a late joiner’s copy keeps the gym’s week 1 when a coach moves its start date; every other copy as in 0167', () => {
    const trigger = squeeze(code('set_programme_week_one'));
    // as 0167: only a rollout copy, on insert without a week 1 or when its start date changes; and now a copy whose rollout has gone (its
    // template deleted empties rollout_id but leaves week_one), so its week 1 still follows a new start date
    expect(trigger).toContain(
      "if (new.rollout_id is not null or (tg_op = 'UPDATE' and old.week_one is not null)) and new.start_date is not null and ((tg_op = 'INSERT' and new.week_one is null) or (tg_op = 'UPDATE' and new.start_date is distinct from old.start_date)) then"
    );
    expect(fs.readFileSync(path.resolve(__dirname, '../migrations', '0094_programme_rollouts.sql'), 'utf8')).toMatch(
      /rollout_id uuid references programme_rollouts\(id\) on delete set null/
    );
    // a late joiner: week 1 before the week its copy started in (only _give_gym_programme sets that), kept while the new start is within the
    // copy's weeks (from that Monday to the Sunday of its last week, as the app counts them); after its last week, from week 1 again as 0167
    expect(trigger).toContain(
      "if tg_op = 'UPDATE' and old.week_one is not null and old.start_date is not null and old.week_one < old.start_date - (extract(isodow from old.start_date)::integer - 1) and new.start_date >= old.week_one and new.start_date <= old.week_one + 7 * greatest(coalesce((select max(d.week_num) from workout_program_days d where d.program_id = new.id), 0), 1) - 1 then new.week_one := old.week_one; else new.week_one := new.start_date - (extract(isodow from new.start_date)::integer - 1); end if;"
    );
    // still fired by 0167's trigger, which this migration leaves as it is
    expect(migrationCode).not.toMatch(/trigger workout_programs_week_one/);
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
    // and every programme of theirs it moves, picked as the update above picks them, so the confirm names each one
    expect(list).toContain("'other_program_id', op.id");
    expect(list).toContain(
      "'moves', ( select coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'starts', x.start_date) order by x.start_date, x.created_at), '[]'::jsonb) from workout_programs x where x.client_id = q.client_id and x.start_date is not null and x.rollout_id is distinct from t.rollout_id and x.start_date >= t.today and x.start_date <= t.last_day)"
    );
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
