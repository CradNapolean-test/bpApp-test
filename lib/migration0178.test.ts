import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0178 can't run here (no database in the tests), so its shape is checked as text: each function checks its caller and is
// locked to the right roles, and the md5 guard matches the bodies actually in the file (an edited body with a stale guard would make the
// migration refuse to re-run, or let a different body through).

const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0178_session_message_goal_move_members_nutrition.sql'), 'utf8').replace(
  /\r\n/g,
  '\n'
);
const FUNCTIONS = ['message_session_booked'];

function functionBlock(name: string): string {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const end = sql.indexOf('$fn$;', start);
  return sql.slice(start, end + 5);
}

// The same squeeze the guard uses: md5(btrim(regexp_replace(prosrc, '\s+', ' ', 'g'))).
function bodyMd5(name: string): string {
  const block = functionBlock(name);
  const body = block.slice(block.indexOf('as $fn$') + 'as $fn$'.length, block.lastIndexOf('$fn$;'));
  return createHash('md5').update(body.replace(/\s+/g, ' ').trim()).digest('hex');
}

describe('migration 0178', () => {
  it('guards each function with the md5 of the body in this file', () => {
    for (const name of FUNCTIONS) expect(sql).toContain(`('${name}', '${bodyMd5(name)}')`);
  });

  it('makes every function security definer with a fixed search path, closed to anyone signed out', () => {
    for (const name of FUNCTIONS) {
      const block = functionBlock(name);
      expect(block).toContain('security definer');
      expect(block).toContain('set search_path = public');
      const revoke = sql.split('\n').find((line) => line.startsWith(`revoke execute on function public.${name}(`));
      expect(revoke).toMatch(/\) from public, anon(, authenticated)?;$/);
    }
  });

  describe('message_session_booked (BK16)', () => {
    const block = () => functionBlock('message_session_booked');

    it('refuses anyone but a coach at the session\'s gym before writing anything', () => {
      const b = block();
      const check = b.indexOf("raise exception 'Not authorized'");
      expect(check).toBeGreaterThan(-1);
      expect(b).toContain('public.my_gym_id() is null or v_gym is distinct from public.my_gym_id()');
      expect(b.indexOf('insert into chat_messages')).toBeGreaterThan(check);
    });

    it('writes only to members booked into that session on that date, from the caller', () => {
      const b = block();
      expect(b).toContain('b.class_id = p_class_id');
      expect(b).toContain('b.booking_date = p_date');
      expect(b).toContain("b.status = 'booked'");
      expect(b).toContain('select distinct b.client_id');
      expect(b).toContain('values (v_member.client_id, auth.uid(), v_text)');
    });

    it('keeps to the chat limit and refuses an empty message', () => {
      const b = block();
      expect(b).toContain('char_length(v_text) > 4000');
      expect(b).toContain("if v_text = '' then");
    });
  });

  describe('the goal move (CL10)', () => {
    const move = () => {
      const start = sql.indexOf('alter table public.client_journal_entries add column if not exists moved_to_goal_at timestamptz;');
      expect(start).toBeGreaterThan(-1);
      return sql.slice(start, sql.indexOf('where j.id = t.id;', start) + 'where j.id = t.id;'.length);
    };

    it('only ever reads goal entries not moved yet, so a second run moves nothing twice', () => {
      const m = move();
      expect(m).toContain("where j.kind = 'goal'\n    and j.moved_to_goal_at is null");
      expect(m).toContain('set moved_to_goal_at = now()');
    });

    it('keeps every row: no delete anywhere in the file', () => {
      expect(sql).not.toMatch(/^\s*delete\s+from/im);
      expect(sql).not.toMatch(/^\s*truncate/im);
    });

    it('appends after the goal, oldest first, a blank line between: the same rule as lib/goalMove.ts', () => {
      const m = move();
      expect(m).toContain("string_agg(t.body, E'\\n\\n' order by t.created_at, t.id)");
      expect(m).toContain("when btrim(coalesce(old_goal, '')) = '' then added");
      expect(m).toContain("else regexp_replace(old_goal, '\\s+$', '') || E'\\n\\n' || added");
      // An entry already in the goal word for word adds nothing; an empty one adds nothing.
      expect(m).toContain("filter (where t.body <> '' and strpos(coalesce(p.goal_description, ''), t.body) = 0)");
    });

    it("never writes a goal past its limit, and marks only the entries of members whose goal was written", () => {
      const m = move();
      expect(m).toContain('where new_goal is null or char_length(new_goal) <= 5000');
      expect(m).toContain('join fits f on f.client_id = t.client_id');
      // The goal is written from the same rows that are marked.
      expect(m).toContain('from fits f\n  where p.client_id = f.client_id');
    });
  });
});
