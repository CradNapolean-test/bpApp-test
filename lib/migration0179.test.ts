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
});
