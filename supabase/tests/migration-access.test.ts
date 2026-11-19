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
    // NU18 (0169) adds the one insert rule for a member's own food; there is still no update or delete rule for anyone but coaches.
    expect(writes).toEqual(['authenticated users cache scanned foods', 'coaches correct scanned foods', 'coaches delete scanned foods', 'members save their own foods']);
    expect(left.get('members save their own foods')).toBe('insert');
    expect([...left.entries()].filter(([, command]) => command === 'select')).toEqual([['authenticated users read foods', 'select']]);
  });
});

// NU18 (0169): a member's own food is a row in foods that only they and their own coach can read, and only they can save as theirs.
describe("a member's own foods are private to them and their own coach (NU18, 0169)", () => {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const read = (f: string) => fs.readFileSync(path.join(migrationsDir, f), 'utf8').replace(/--.*$/gm, '');
  // The last "create policy <name> on public.foods ..." statement in the migrations, up to its semicolon.
  const lastPolicy = (name: string) => {
    let found = '';
    for (const f of files) {
      const sql = read(f);
      const re = new RegExp(`create\\s+policy\\s+"${name}"\\s+on\\s+public\\.foods[^;]*;`, 'gi');
      for (const m of sql.matchAll(re)) found = m[0];
    }
    return found.replace(/\s+/g, ' ');
  };

  it('the read rule lets every signed-in user read the shared foods, and an own food only its owner and their coach', () => {
    expect(lastPolicy('authenticated users read foods')).toMatch(/using \(owner_id is null or public\.owns_client\(owner_id\)\)/);
  });

  it('a member can only save an own food as their own, with no barcode or brand', () => {
    const rule = lastPolicy('members save their own foods');
    expect(rule).toMatch(/for insert/);
    expect(rule).toMatch(/source = 'own'/);
    expect(rule).toMatch(/owner_id = auth\.uid\(\)/);
    expect(rule).toMatch(/barcode is null/);
    expect(rule).toMatch(/brand is null/);
  });

  it('only an own food has an owner, so the scanned-food rules cannot make one', () => {
    const sql = files.map(read).join('\n');
    expect(sql).toMatch(/add constraint foods_own_food_owner check \(\(source = 'own'\) = \(owner_id is not null\)\)/);
  });

  it("the search lists the caller's own foods and nobody else's", () => {
    const latest = files.filter((f) => /create or replace function public\.search_foods\(/.test(read(f))).at(-1) as string;
    const body = read(latest).slice(read(latest).indexOf('create or replace function public.search_foods('));
    expect(body).toMatch(/and \(f\.owner_id is null or f\.owner_id = p\.me\)/);
    expect(body).toMatch(/auth\.uid\(\) as me/);
    // still runs as the caller, so the read rule applies inside it too
    expect(body.slice(0, body.indexOf('$fn$;'))).not.toMatch(/security definer/);
  });

  it('removing an own food only hides the caller\'s own', () => {
    const latest = files.filter((f) => /create or replace function public\.remove_own_food\(/.test(read(f))).at(-1) as string;
    const body = read(latest).slice(read(latest).indexOf('create or replace function public.remove_own_food('));
    expect(body).toMatch(/update public\.foods set hidden = true\s+where id = p_food_id and source = 'own' and owner_id = auth\.uid\(\)/);
  });
});

// Decision D3 (4 Nov 2026): chat is between a member and their own coach. 0053 opened chat_messages and chat_threads to every coach
// in the gym through a loop (dynamic SQL, which replayPolicies cannot see), and 0153 closes them again.
describe('chat is readable by the member and their own coach only (D3, 0153)', () => {
  const migrationsDir = path.resolve(__dirname, '../migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();
  const read = (f: string) => fs.readFileSync(path.join(migrationsDir, f), 'utf8');

  it('0153 drops both gym-wide chat read rules', () => {
    const sql = read('0153_chat_own_coach_only.sql');
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"same-gym coach reads chat_messages"\s+on\s+public\.chat_messages/i);
    expect(sql).toMatch(/drop\s+policy\s+if\s+exists\s+"same-gym coach reads chat_threads"\s+on\s+public\.chat_threads/i);
  });

  it('only the own-or-assigned-coach rules are left on the chat tables', () => {
    const policies = replayPolicies();
    expect([...(policies.get('chat_messages') ?? new Map()).entries()].sort()).toEqual([
      ['client or coach posts into owned thread', 'insert'],
      ['select own or coached chat_messages', 'select'],
    ]);
    expect([...(policies.get('chat_threads') ?? new Map()).entries()]).toEqual([['select own or coached chat_threads', 'select']]);
  });

  it('no later migration opens chat to the whole gym again, directly or through a table loop', () => {
    for (const f of files.filter((name) => name > '0153')) {
      const sql = read(f).replace(/--.*$/gm, '');
      expect(sql, f).not.toMatch(/create\s+policy\s+"[^"]*"\s+on\s+(?:public\.)?chat_(?:messages|threads)\b[^;]*(?:is_same_gym_as_client|is_coach_in_gym)/i);
      expect(sql, f).not.toMatch(/array\s*\[[^\]]*'chat_(?:messages|threads)'/i);
    }
  });
});
