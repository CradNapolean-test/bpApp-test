import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

// Migration 0177 can't run here (no database in the tests), so its shape is checked as text: each function checks its caller and is
// locked to the right roles, the warning is once per grant, and the md5 guard matches the bodies actually in the file (an edited body
// with a stale guard would make the migration refuse to re-run, or let a different body through).

const sql = readFileSync(join(__dirname, '..', 'supabase', 'migrations', '0177_waitlist_places_bonus_expiry_warnings.sql'), 'utf8');

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

describe('migration 0177', () => {
  it('guards each function with the md5 of the body in this file', () => {
    for (const name of ['my_waitlist_places', 'warn_expiring_bonus_credits']) {
      expect(sql).toContain(`('${name}', '${bodyMd5(name)}')`);
    }
  });

  it('makes both functions security definer with a fixed search path', () => {
    for (const name of ['my_waitlist_places', 'warn_expiring_bonus_credits']) {
      const block = functionBlock(name);
      expect(block).toContain('security definer');
      expect(block).toContain('set search_path = public');
    }
  });

  it('answers a member about their own waitlist rows only, and never signed out', () => {
    const block = functionBlock('my_waitlist_places');
    expect(block).toContain('mine.client_id = auth.uid()');
    expect(block).toContain('auth.uid() is not null');
    expect(block).toContain("mine.status = 'waitlist'");
    // Only the number leaves the function: nothing from the rows ahead (their id, member or name) is selected.
    expect(block).not.toMatch(/select\s+ahead\.(id|client_id)/);
    expect(block).not.toMatch(/client_profiles|profiles/);
    expect(sql).toContain('revoke execute on function public.my_waitlist_places() from public, anon;');
    expect(sql).toContain('grant execute on function public.my_waitlist_places() to authenticated;');
  });

  it('counts the queue in the order people come off it (created_at, then id)', () => {
    expect(functionBlock('my_waitlist_places')).toContain('(ahead.created_at, ahead.id) < (mine.created_at, mine.id)');
  });

  it('keeps the expiry warning for the daily job only', () => {
    expect(sql).toContain('revoke execute on function public.warn_expiring_bonus_credits(integer) from public, anon, authenticated;');
    expect(sql).toContain('grant execute on function public.warn_expiring_bonus_credits(integer) to service_role;');
    expect(sql).not.toMatch(/grant execute on function public\.warn_expiring_bonus_credits\(integer\) to (authenticated|anon)/);
  });

  it('warns once per grant: a record per grant, claimed before the notice, and grants already warned are skipped', () => {
    const block = functionBlock('warn_expiring_bonus_credits');
    expect(sql).toContain('ledger_id uuid primary key references public.credits_ledger(id)');
    expect(block).toContain('not exists (select 1 from bonus_expiry_warnings w where w.ledger_id = l.id)');
    expect(block).toContain('on conflict (ledger_id) do nothing');
    const claim = block.indexOf('on conflict (ledger_id) do nothing');
    const skip = block.indexOf('continue when not found', claim);
    const notice = block.indexOf('insert into notifications', claim);
    expect(skip).toBeGreaterThan(claim);
    expect(notice).toBeGreaterThan(skip);
  });

  it('warns only about grants still to expire, inside the window, with credits left', () => {
    const block = functionBlock('warn_expiring_bonus_credits');
    expect(block).toContain('l.expires_at > now() and l.expires_at <= now() + make_interval(days => v_days)');
    expect(block).toContain('l.expired_at is null');
    expect(block).toContain('continue when v_left <= 0');
    expect(block).toContain('least(greatest(coalesce(p_days, 3), 1), 14)');
  });

  it('keeps the warnings table private to the database', () => {
    expect(sql).toContain('alter table public.bonus_expiry_warnings enable row level security;');
    expect(sql).toContain('revoke all on table public.bonus_expiry_warnings from public, anon, authenticated;');
    expect(sql).not.toMatch(/create policy/i);
  });
});
