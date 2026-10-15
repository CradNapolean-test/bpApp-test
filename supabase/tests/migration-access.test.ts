import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { replayPolicies } from './replayPolicies';

// Static checks on the SQL files (no database): the access rules the audit fixes (docs/fix-briefs/01) must still be in
// place after every migration is replayed in order. These catch a later migration quietly undoing a fix; the live behaviour
// is checked by the sandbox scripts in supabase/tests/security-audit/.
const require = createRequire(import.meta.url);
const { parseFunctions, access } = require('./security-audit/parse-functions.cjs') as {
  parseFunctions: () => { name: string; key: string; securityDefiner: boolean; searchPath: string | null; acl: unknown[] }[];
  access: (fn: unknown) => { anon: boolean; authenticated: boolean };
};

describe('function access after every migration', () => {
  const definers = parseFunctions().filter((f) => f.securityDefiner);

  it('no security-definer function can be executed by a logged-out caller', () => {
    const open = definers.filter((f) => access(f).anon).map((f) => f.key);
    expect(open).toEqual([]);
  });

  it('every security-definer function pins its search_path', () => {
    const unpinned = definers.filter((f) => !f.searchPath).map((f) => f.key);
    expect(unpinned).toEqual([]);
  });

  it('the web-push registration function exists and is signed-in only', () => {
    const fn = parseFunctions().find((f) => f.name === 'register_web_push');
    expect(fn?.securityDefiner).toBe(true);
    expect(fn && access(fn)).toEqual({ anon: false, authenticated: true });
  });
});

describe('row-level security rules after every migration', () => {
  const policies = replayPolicies();

  it('members have no direct write rule on bookings (H2): the booking functions are the only way in', () => {
    const left = [...(policies.get('bookings') ?? new Map<string, string>()).entries()];
    expect(left.filter(([, command]) => command !== 'select')).toEqual([]);
    expect(left.length).toBeGreaterThan(0); // the read rule is still there
  });

  it('the exercise library has a read rule and only the add / author-or-admin edit and delete rules (H1, then CM4 in 0130)', () => {
    const left = policies.get('exercise_library') ?? new Map<string, string>();
    expect([...left.keys()].sort()).toEqual([
      'authenticated users read exercise_library',
      'coaches add to exercise_library',
      'owners delete exercise_library',
      'owners edit exercise_library',
    ]);
    // no rule may let every signed-in user write: nothing is a catch-all "all" rule any more
    expect([...left.values()].filter((command) => command === 'all')).toEqual([]);
  });

  it('the old open exercise-library rule is not recreated by any migration (H1)', () => {
    const migrations = fs
      .readdirSync(path.resolve(__dirname, '../migrations'))
      .filter((f) => f.endsWith('.sql') && f > '0127')
      .map((f) => fs.readFileSync(path.join(path.resolve(__dirname, '../migrations'), f), 'utf8'));
    for (const sql of migrations) {
      expect(sql).not.toMatch(/create\s+policy\s+"authenticated coaches manage exercise_library"/i);
    }
  });

  it('only coaches can correct or delete foods (M12), and only scanned ones', () => {
    const left = policies.get('foods') ?? new Map<string, string>();
    expect(left.get('coaches correct scanned foods')).toBe('update');
    expect(left.get('coaches delete scanned foods')).toBe('delete');
    const writes = [...left.entries()].filter(([, command]) => command !== 'select').map(([name]) => name).sort();
    expect(writes).toEqual(['authenticated users cache scanned foods', 'coaches correct scanned foods', 'coaches delete scanned foods']);
  });
});
