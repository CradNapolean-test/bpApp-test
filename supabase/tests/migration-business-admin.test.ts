import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on the SQL files (no database) for decision D3 (6 Nov 2026, live review BO13 / DB18 / CV24 / RO21): plans, credit packs
// and rewards are changed by a gym admin or the owner only (migration 0161). These catch a later migration putting the old "every coach
// at the gym" rule back; the behaviour on real logins is the live check in the hand-over (an admin, a floor coach, the owner).
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; body: string; securityDefiner: boolean; searchPath: string | null; acl: unknown[] }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

const migrationsDir = path.resolve(__dirname, '../migrations');
const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
const read = (f: string) => fs.readFileSync(path.join(migrationsDir, f), 'utf8').replace(/\r\n/g, '\n');
const MIGRATION = '0161_business_admin_only.sql';
const TABLES = ['membership_packages', 'credit_packs', 'rewards'] as const;

const fns = parseFunctions();
const latest = (name: string) => {
  const matches = fns.filter((f) => f.name === name);
  if (matches.length === 0) throw new Error(`function ${name} not found in the migrations`);
  return matches[matches.length - 1];
};
const code = (name: string) => latest(name).body.replace(/--.*$/gm, '');

describe('plans, credit packs and rewards: gym admins and the owner write, everyone in the gym reads (D3, 0161)', () => {
  const policies = replayPolicies();

  for (const table of TABLES) {
    it(`${table}: only the add / change / remove rules write, and no catch-all rule is left`, () => {
      const left = policies.get(table) ?? new Map<string, string>();
      const writes = [...left.entries()].filter(([, command]) => command !== 'select').sort();
      expect(writes).toEqual(
        [
          [`gym admins add ${table}`, 'insert'],
          [`gym admins change ${table}`, 'update'],
          [`gym admins remove ${table}`, 'delete'],
        ].sort()
      );
      expect(left.has(`gym coaches manage ${table}`)).toBe(false);
    });

    it(`${table}: members and coaches of the gym still read it, and the owner can too`, () => {
      const left = policies.get(table) ?? new Map<string, string>();
      expect(left.get(`gym reads ${table}`)).toBe('select');
      expect(left.get(`owner reads ${table}`)).toBe('select');
    });

    it(`${table}: every write rule asks can_manage_gym_business for the row's gym`, () => {
      const sql = read(MIGRATION).replace(/--.*$/gm, '');
      for (const verb of ['add', 'change', 'remove']) {
        const statement = new RegExp(`create\\s+policy\\s+"gym admins ${verb} ${table}"[^;]*;`, 'i').exec(sql)?.[0] ?? '';
        expect(statement, `${verb} ${table}`).toMatch(/to\s+authenticated/i);
        expect(statement, `${verb} ${table}`).toMatch(/can_manage_gym_business\(gym_id\)/);
        expect(statement, `${verb} ${table}`).not.toMatch(/my_gym_id\(\)/);
      }
    });
  }

  it('no later migration gives every coach at the gym write access again', () => {
    for (const f of files.filter((name) => name > MIGRATION)) {
      const sql = read(f).replace(/--.*$/gm, '');
      for (const table of TABLES) {
        expect(sql, f).not.toMatch(new RegExp(`create\\s+policy\\s+"[^"]*"\\s+on\\s+(?:public\\.)?${table}\\s+for\\s+(?:all|insert|update|delete)\\b[^;]*my_gym_id\\(\\)`, 'i'));
      }
    }
  });
});

describe('can_manage_gym_business: who counts as allowed (0161)', () => {
  it('is a security-definer function with a pinned search path, for signed-in callers only', () => {
    const fn = latest('can_manage_gym_business');
    expect(fn.securityDefiner).toBe(true);
    expect(fn.searchPath).toBeTruthy();
    expect(access(fn)).toEqual({ anon: false, authenticated: true });
  });

  it('a coach needs the Admin switch for that very gym, an active coach login, or else to be the owner of the gym', () => {
    const body = code('can_manage_gym_business');
    expect(body).toMatch(/p_gym is not null/);
    expect(body).toMatch(/m\.coach_id = auth\.uid\(\)/);
    expect(body).toMatch(/m\.gym_id = p_gym/);
    expect(body).toMatch(/m\.is_gym_admin/);
    expect(body).toMatch(/p\.role = 'coach'/);
    expect(body).toMatch(/p\.deactivated_at is null/);
    expect(body).toMatch(/is_owner_of_gym\(p_gym\)/);
    // the active-gym cache on profiles is not the rule: it only knows one gym at a time
    expect(body).not.toMatch(/my_gym_id\(\)/);
  });
});

describe('owner_plan_member_counts: members per plan for the owner (0161)', () => {
  it('refuses anyone who is not the owner of that gym, and cannot be called signed out', () => {
    const fn = latest('owner_plan_member_counts');
    expect(fn.securityDefiner).toBe(true);
    expect(access(fn).anon).toBe(false);
    expect(code('owner_plan_member_counts')).toMatch(/if not coalesce\(public\.is_owner_of_gym\(p_gym\), false\) then\s+raise exception/);
  });

  it('counts the same thing as plan_member_counts: open memberships of members whose home gym it is', () => {
    const body = code('owner_plan_member_counts');
    expect(body).toMatch(/cm\.ended_at is null/);
    expect(body).toMatch(/p\.gym_id = p_gym/);
  });
});
