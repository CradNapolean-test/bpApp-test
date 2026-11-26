import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0175's guard refuses a function body it does not know, by md5 of the body with whitespace collapsed (as Postgres computes
// md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g')))). This keeps the guard and the AFTER notes in step with the bodies, and checks the
// rules each function must keep: run as the owner with a fixed search_path, refuse anyone who is not a coach working in the gym, and
// only touch that gym's members.
const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0175_library_forms_courses.sql'), 'utf8');

function bodies(): Map<string, { header: string; body: string }> {
  const out = new Map<string, { header: string; body: string }>();
  for (const m of sql.matchAll(/create or replace function public\.([a-z_]+)\(([^]*?)\bas \$fn\$([^]*?)\$fn\$;/g)) {
    out.set(m[1], { header: m[2], body: m[3] });
  }
  return out;
}

const md5 = (body: string) => createHash('md5').update(body.replace(/[ \t\n\r\f\v]+/g, ' ').replace(/^ +| +$/g, ''), 'utf8').digest('hex');

describe('migration 0175', () => {
  const fns = bodies();

  it('creates the four functions', () => {
    expect([...fns.keys()].sort()).toEqual(['assign_form_to_group', 'clear_course_assigned_notice', 'remind_form', 'unassign_education_course']);
  });

  it("has each body's md5 in the guard and in the AFTER notes", () => {
    for (const [name, { body }] of fns) {
      const hash = md5(body);
      expect(sql).toContain(`('${name}', '${hash}')`);
      expect(sql.split(hash).length - 1).toBeGreaterThanOrEqual(2);
    }
  });

  it('runs every function as the owner with a fixed search_path', () => {
    for (const { header } of fns.values()) {
      expect(header).toContain('security definer');
      expect(header).toContain('set search_path = public');
    }
  });

  it('checks the caller is a coach in the gym, and the gym of the form, group, course and members', () => {
    for (const name of ['assign_form_to_group', 'remind_form', 'unassign_education_course']) {
      const { body } = fns.get(name)!;
      expect(body).toContain('v_gym uuid := public.my_gym_id();');
      expect(body).toMatch(/if v_gym is null then\s+raise exception/);
      expect(body).toContain('public.client_gym_id(');
    }
    expect(fns.get('assign_form_to_group')!.body).toContain('v_template.gym_id is distinct from v_gym');
    expect(fns.get('assign_form_to_group')!.body).toContain('v_group_gym is distinct from v_gym');
    expect(fns.get('remind_form')!.body).toContain('v_template.gym_id is distinct from v_gym');
    expect(fns.get('unassign_education_course')!.body).toContain('v_course_gym is distinct from v_gym');
  });

  it('lets signed-in users call the three actions, nobody signed out, and nobody the trigger function', () => {
    for (const sig of ['assign_form_to_group(uuid, uuid)', 'remind_form(uuid, uuid[])', 'unassign_education_course(uuid, uuid)']) {
      expect(sql).toContain(`revoke execute on function public.${sig} from public, anon;`);
      expect(sql).toContain(`grant execute on function public.${sig} to authenticated;`);
    }
    expect(sql).toContain('revoke execute on function public.clear_course_assigned_notice() from public, anon, authenticated;');
  });

  it('skips members who have the form open, and locks per form', () => {
    const { body } = fns.get('assign_form_to_group')!;
    expect(body).toContain('a.completed_at is null');
    expect(body).toContain("pg_advisory_xact_lock(hashtextextended('form-send:'");
    expect(fns.get('remind_form')!.body).toContain("interval '12 hours'");
  });

  it('clears notices instead of deleting them', () => {
    expect(sql).not.toMatch(/delete from (public\.)?notifications/);
    expect(sql).toContain("set cleared_at = now(), read_at = coalesce(n.read_at, now())");
  });
});
