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
});
