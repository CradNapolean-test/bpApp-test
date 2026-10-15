import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

// Static checks on the SQL files (no database) for fix brief 08: the owner report fixes (0144) and the small functions of 0142 must be
// in the latest definition of each function after every migration is replayed. Their behaviour on real data is for the sandbox.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; body: string; securityDefiner: boolean; file: string; acl: unknown[] }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');

describe('owner report numbers (R30, migration 0144)', () => {
  it('the weekday averages are divided by the weeks since each gym started logging, not always 8', () => {
    const body = code('owner_activity_report');
    expect(body).not.toMatch(/8\s*\*\s*v_eligible/);
    expect(body).toMatch(/_gym_start/);
    expect(body).toMatch(/greatest\(v_this_week\s*-\s*56/);
  });

  it('the report also says today, every member and how many weeks the averages cover', () => {
    const body = code('owner_activity_report');
    expect(body).toMatch(/'today',\s*v_today/);
    expect(body).toMatch(/'allMembers'/);
    expect(body).toMatch(/'weekdayWeeks'/);
  });

  it('the report keeps its owner checks', () => {
    const body = code('owner_activity_report');
    expect(body).toMatch(/is_owner\(\)/);
    expect(body).toMatch(/is_owner_of_gym\(p_gym\)/);
  });

  it('owner_gym_stats compares like with like and counts finished onboarding', () => {
    const body = code('owner_gym_stats');
    expect(body).toMatch(/'attendedLastMonthToDate'/);
    expect(body).toMatch(/'dayOfMonth'/);
    expect(body).toMatch(/'onboarded'/);
    expect(body).toMatch(/is_owner\(\)/);
    // the figures it returned before are still there
    for (const key of ['attendedThisMonth', 'attendedLastMonth', 'unmarkedSessions', 'redFlags', 'team']) {
      expect(body).toContain(`'${key}'`);
    }
  });

  it('neither function can be called without signing in', () => {
    expect(access(latest('owner_gym_stats')).anon).toBe(false);
    expect(access(latest('owner_activity_report')).anon).toBe(false);
  });
});

describe('sign-up link rotation and the admin audit (0142)', () => {
  it('rotate_my_join_link is for signed-in coaches only and makes a long random token', () => {
    const fn = latest('rotate_my_join_link');
    expect(fn.securityDefiner).toBe(true);
    expect(access(fn).anon).toBe(false);
    const body = code('rotate_my_join_link');
    expect(body).toMatch(/role = 'coach'/);
    expect(body).toMatch(/gen_random_uuid\(\)/);
    expect(body).toMatch(/on conflict \(coach_id\) do update set token/);
  });

  it('the admin audit trigger function cannot be called from the API', () => {
    const fn = latest('log_admin_flag_change');
    expect(fn.securityDefiner).toBe(true);
    expect(access(fn).anon).toBe(false);
    expect(access(fn).authenticated).toBe(false);
  });
});

describe('the referral link setting (R16, migration 0144)', () => {
  it('only a gym admin of their own gym, or the gym\'s owner, can set it', () => {
    expect(code('set_gym_referral_url')).toMatch(/is_gym_admin/);
    expect(code('set_gym_referral_url')).toMatch(/my_gym_id\(\)/);
    expect(code('owner_set_gym_referral_url')).toMatch(/is_owner_of_gym\(p_gym\)/);
  });

  it('the shared function accepts only an https address of at most 500 characters', () => {
    const body = code('_set_gym_referral_url');
    expect(body).toMatch(/https:\/\//);
    expect(body).toMatch(/char_length\(v_url\) > 500/);
  });

  it('none of them can be called without signing in; the internal one not at all', () => {
    expect(access(latest('set_gym_referral_url')).anon).toBe(false);
    expect(access(latest('owner_set_gym_referral_url')).anon).toBe(false);
    expect(access(latest('_set_gym_referral_url')).authenticated).toBe(false);
  });
});
