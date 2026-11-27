import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0179 can't run here (no database in the tests), so its shape is checked as text: the md5 guard matches the bodies actually in
// the file (an edited body with a stale guard would make the migration refuse to re-run, or let a different body through).

const read = (file: string) => readFileSync(join(__dirname, '..', 'supabase', 'migrations', file), 'utf8').replace(/\r\n/g, '\n');
const sql = read('0179_exercise_usage_form_question_types.sql');

function functionBlock(source: string, name: string, quote = '$fn$'): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const open = source.indexOf(`as ${quote}`, start);
  const end = source.indexOf(`${quote};`, open + quote.length + 3);
  return source.slice(start, end + quote.length + 1);
}

// The same squeeze the guard uses: md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))).
function bodyMd5(source: string, name: string, quote = '$fn$'): string {
  const block = functionBlock(source, name, quote);
  const body = block.slice(block.indexOf(`as ${quote}`) + 3 + quote.length, block.lastIndexOf(`${quote};`));
  return createHash('md5').update(body.replace(/\s+/g, ' ').trim()).digest('hex');
}

describe('migration 0179', () => {
  describe('exercise_library_usage (LB11)', () => {
    const block = () => functionBlock(sql, 'exercise_library_usage');

    it('is guarded by the md5 of its body in this file', () => {
      expect(sql).toContain(`('exercise_library_usage', '${bodyMd5(sql, 'exercise_library_usage')}')`);
    });

    it('runs as the caller (so the read rules decide what it counts), reads only, and is closed to anyone signed out', () => {
      const b = block();
      expect(b).toContain('security invoker');
      expect(b).not.toContain('security definer');
      expect(b).toContain('stable');
      expect(b).toContain('set search_path = public');
      expect(b).not.toMatch(/\b(insert|update|delete)\b/i);
      expect(sql).toContain('revoke execute on function public.exercise_library_usage() from public, anon;');
      expect(sql).toContain('grant execute on function public.exercise_library_usage() to authenticated;');
    });

    it("counts distinct templates and distinct members' programmes, in one statement", () => {
      const b = block();
      expect(b).toContain('count(distinct d.template_id)');
      expect(b).toContain('count(distinct d.program_id)');
      expect(b).toContain('from workout_exercises e');
      expect(b).toContain('full join p on p.id = t.id');
    });
  });

  describe('the new question types (LB22)', () => {
    const old0111 = read('0111_forms_onboarding_checkin_limits.sql');
    const old0135 = read('0135_forms_save_and_event_notifications.sql');
    const bodyOf = (source: string, name: string, quote = '$fn$') => {
      const block = functionBlock(source, name, quote);
      return block.slice(block.indexOf(`as ${quote}`) + 3 + quote.length, block.lastIndexOf(`${quote};`));
    };

    it('guards every function it creates or replaces with the md5 of its body here, and the replaced ones with the body they replace', () => {
      expect(sql).toContain(`('form_question_types', '${bodyMd5(sql, 'form_question_types')}')`);
      expect(sql).toContain(`('submit_form_response', '${bodyMd5(old0111, 'submit_form_response', '$$')}', '${bodyMd5(sql, 'submit_form_response')}')`);
      expect(sql).toContain(`('save_form_template', '${bodyMd5(old0135, 'save_form_template')}', '${bodyMd5(sql, 'save_form_template')}')`);
      // The PRE-FLIGHT and AFTER expectations quote the same values.
      expect(sql).toContain(`submit_form_response ${bodyMd5(old0111, 'submit_form_response', '$$')}`);
      expect(sql).toContain(`submit_form_response ${bodyMd5(sql, 'submit_form_response')}, prosecdef true`);
      expect(sql).toContain(`save_form_template ${bodyMd5(sql, 'save_form_template')}, prosecdef true`);
    });

    it("keeps submit_form_response exactly 0111's, caller checks and all, with only the yes / no and scale checks added", () => {
      const now = bodyOf(sql, 'submit_form_response');
      const added = now.slice(now.indexOf('    -- Yes / no and 1-10 scale (0179)'), now.indexOf('\n    insert into form_responses'));
      expect(added).toContain("jsonb_typeof(v_answer.answer) <> 'boolean'");
      expect(added).toContain('not between 1 and 10');
      expect(added).toContain('<> trunc(');
      expect(now.replace(added, '')).toBe(bodyOf(old0111, 'submit_form_response', '$$'));
      const header = (src: string, q: string) => {
        const b = functionBlock(src, 'submit_form_response', q);
        return b.slice(0, b.indexOf(`as ${q}`));
      };
      expect(header(sql, '$fn$')).toBe(header(old0111, '$$'));
      expect(sql).toContain('revoke execute on function public.submit_form_response(uuid, jsonb) from public, anon;');
    });

    it("keeps save_form_template 0135's, caller checks and all, with only the new types, the scale's words and the optional rule", () => {
      const now = bodyOf(sql, 'save_form_template');
      const was = bodyOf(old0135, 'save_form_template');
      const callerChecks = (b: string) => b.slice(0, b.indexOf("  v_name := btrim(coalesce(p_fields ->> 'name', ''));"));
      expect(callerChecks(now)).toBe(callerChecks(was));
      expect(callerChecks(now)).toContain('is_coach_in_gym(v_template.gym_id)');
      expect(now).toContain("'multi_choice', 'yes_no', 'scale')");
      expect(now).toContain("= 'true' and v_type not in ('yes_no', 'scale');");
      // Everything after the question writes (deleting or archiving questions taken out) is unchanged.
      const rest = (b: string) => b.slice(b.indexOf('    v_id := nullif('));
      expect(rest(now)).toBe(rest(was));
      expect(sql).toContain('revoke execute on function public.save_form_template(uuid, jsonb, jsonb) from public, anon;');
    });

    it('lets the type check take the two types, and keeps them optional at the database too', () => {
      expect(sql).toContain('alter table public.form_questions drop constraint if exists form_questions_question_type_check;');
      expect(sql).toContain("question_type in ('short_text', 'long_text', 'number', 'single_choice', 'multi_choice', 'yes_no', 'scale')");
      expect(sql).toContain("question_type not in ('yes_no', 'scale') or not required");
    });

    it('form_question_types reads nothing and is closed to anyone signed out', () => {
      const b = functionBlock(sql, 'form_question_types');
      expect(b).toContain('security invoker');
      expect(b).toContain('immutable');
      expect(b).toContain('set search_path = public');
      expect(sql).toContain('revoke execute on function public.form_question_types() from public, anon;');
    });

    it('stops before changing anything when a replaced function is missing or has changed', () => {
      const guard = sql.slice(sql.indexOf('do $guard$'), sql.indexOf('$guard$;'));
      expect(guard).toContain("raise exception 'function % is missing, so nothing was changed.'");
      expect(guard).toContain('has changed since this file was written');
      expect(sql.indexOf('$guard$;')).toBeLessThan(sql.indexOf('\nalter table public.form_questions'));
    });
  });
});
