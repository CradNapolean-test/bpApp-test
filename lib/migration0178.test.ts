import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0178 can't run here (no database in the tests), so its shape is checked as text: each function checks its caller and is
// locked to the right roles, and the md5 guard matches the bodies actually in the file (an edited body with a stale guard would make the
// migration refuse to re-run, or let a different body through).

const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0178_session_message_goal_move.sql'), 'utf8').replace(
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

    it('writes only to members of the gym booked into that session on that date, from the caller, and from yesterday on', () => {
      const b = block();
      expect(b).toContain('b.class_id = p_class_id');
      expect(b).toContain('b.booking_date = p_date');
      expect(b).toContain("b.status = 'booked'");
      expect(b).toContain('and m.gym_id = v_gym');
      expect(b).toContain('select distinct b.client_id, m.coach_id');
      expect(b).toContain('p_date < current_date - 1');
      expect(b).toMatch(/values \(\s*v_member\.client_id,\s*auth\.uid\(\),/);
    });

    it("names the sender to a colleague's member, and keeps to the chat limit with room for the name", () => {
      const b = block();
      expect(b).toContain(
        "case when v_member.coach_id is distinct from auth.uid() then coalesce(v_sender, 'A coach at your gym') || ' (coach): ' || v_text else v_text end"
      );
      expect(b).toContain('left(btrim(p.display_name), 40)');
      expect(b).toContain('char_length(v_text) > 3900');
      expect(b).toContain("if v_text = '' then");
    });
  });

  describe('the goal move (CL10)', () => {
    const move = () => {
      const start = sql.indexOf('alter table public.client_journal_entries add column if not exists moved_to_goal_at timestamptz;');
      expect(start).toBeGreaterThan(-1);
      return sql.slice(start, sql.indexOf('$move$;', start) + '$move$;'.length);
    };

    it('only ever reads goal entries not moved yet, so a second run moves nothing twice', () => {
      const m = move();
      expect(m).toContain("where j.kind = 'goal'\n        and j.moved_to_goal_at is null");
      expect(m).toContain('set moved_to_goal_at = now() where id = any(v_member.entry_ids)');
    });

    it('keeps every row: no delete anywhere in the file', () => {
      expect(sql).not.toMatch(/^\s*delete\s+from/im);
      expect(sql).not.toMatch(/^\s*truncate/im);
    });

    it('appends after the goal, oldest first, a blank line between, once per wording, unless already a paragraph: the rule in lib/goalMove.ts', () => {
      const m = move();
      expect(m).toContain(String.raw`regexp_replace(j.body, '^\s+|\s+$', '', 'g') as body`);
      expect(m).toContain(String.raw`string_agg(x.body, E'\n\n' order by x.created_at, x.id)`);
      expect(m).toContain('row_number() over (partition by t.client_id, t.body order by t.created_at, t.id) as nth');
      expect(m).toContain("x.body <> '' and x.nth = 1 and not x.already_there");
      expect(m).toContain(String.raw`regexp_split_to_table(coalesce(p.goal_description, ''), '\n\s*\n') as para`);
      expect(m).toContain("when btrim(coalesce(old_goal, '')) = '' then added");
      expect(m).toContain(String.raw`else regexp_replace(old_goal, '\s+$', '') || E'\n\n' || added`);
    });

    it('never writes past the limit, writes each member on their own, and marks only members whose goal was written', () => {
      const m = move();
      expect(m).toContain('char_length(v_member.new_goal) > 5000');
      expect(m).toContain('exception when check_violation then');
      // The goal and the marks are in the same block, so a refused goal leaves the entries unmarked.
      const inner = m.slice(m.indexOf('    begin\n'), m.indexOf('exception when check_violation'));
      expect(inner).toContain('update public.client_profiles set goal_description = v_member.new_goal');
      expect(inner).toContain('update public.client_journal_entries set moved_to_goal_at = now()');
    });
  });
});
