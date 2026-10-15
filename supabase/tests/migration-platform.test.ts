import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Static checks on migrations 0137 and 0138 (fix brief 07). The live behaviour needs a sandbox project.
const read = (name: string) => readFileSync(new URL(`../migrations/${name}`, import.meta.url), 'utf8').replace(/--.*$/gm, '');

describe('0137: member_strength_bests (H5, ST1)', () => {
  const sql = read('0137_member_strength_bests.sql');

  it('is a security definer function with a pinned search path, for signed-in callers only', () => {
    expect(sql).toMatch(/create or replace function public\.member_strength_bests\(p_client uuid, p_before timestamptz default null\)/);
    expect(sql).toMatch(/security definer/);
    expect(sql).toMatch(/set search_path = public/);
    expect(sql).toMatch(/revoke execute on function public\.member_strength_bests\(uuid, timestamptz\) from public, anon;/);
    expect(sql).toMatch(/grant execute on function public\.member_strength_bests\(uuid, timestamptz\) to authenticated;/);
  });

  it('answers only for the member or their coach', () => {
    expect(sql).toMatch(/public\.owns_client\(p_client\)/);
  });

  it('scores a set the way the app does: no warm-ups, no empty sets, estimated one-rep max up to 12 reps', () => {
    expect(sql).toMatch(/set_type is distinct from 'warmup'/);
    expect(sql).toMatch(/coalesce\(l\.actual_load, 0\) > 0/);
    expect(sql).toMatch(/coalesce\(l\.actual_reps, 0\) > 0/);
    expect(sql).toMatch(/when l\.actual_reps = 1 then l\.actual_load/);
    expect(sql).toMatch(/when l\.actual_reps <= 12 then l\.actual_load \* \(1 \+ l\.actual_reps \/ 30\.0\)/);
  });

  it('returns one best set per exercise and can look only at sets before a date', () => {
    expect(sql).toMatch(/select distinct on \(s\.key\)/);
    expect(sql).toMatch(/order by s\.key, s\.score desc, s\.logged_at desc/);
    expect(sql).toMatch(/p_before is null or l\.logged_at < p_before/);
  });
});

describe('0138: referral link and consent (R16, R22)', () => {
  const sql = read('0138_referral_url_and_consent.sql');

  it('adds a nullable referral link to gyms, https only', () => {
    expect(sql).toMatch(/alter table public\.gyms add column if not exists referral_url text;/);
    expect(sql).not.toMatch(/referral_url text not null/i);
    expect(sql).toMatch(/referral_url is null or \(referral_url ~\* '\^https:\/\/' and char_length\(referral_url\) <= 500\)/);
    expect(sql).toMatch(/drop constraint if exists gyms_referral_url_https/);
  });

  it('adds a nullable consent time to member profiles', () => {
    expect(sql).toMatch(/alter table public\.client_profiles add column if not exists consented_at timestamptz;/);
    expect(sql).not.toMatch(/consented_at timestamptz not null/i);
  });
});
