// A member's own foods (NU18, migration 0169): who can save, read, find, change and remove one, and that a member who logged one can
// still be deleted. These are the write checks listed in 0169's header, run against a real database, so a later migration that keeps the
// rule's text but widens who can read (another read rule, a changed helper) is caught here and not only by the static tests.
// SANDBOX ONLY: it creates and deletes its own test gyms and accounts (zz-ownfoods-*@example.com) and their rows; the sandbox members
// are not touched.
//   node supabase/tests/security-audit/own-foods-check.cjs --ref=<your sandbox project ref>
// Needs migration 0169 applied to the sandbox. Exit code 1 on any failure, 2 on a script error.
require('./_safety.cjs');
const path = require('path');
const crypto = require('crypto');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const TAG = 'zz-ownfoods';
const randomPassword = () => 'Zz1!' + crypto.randomBytes(9).toString('base64url');

(async () => {
  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const created = { users: [], gyms: [] };

  const mkUser = async (label, profile) => {
    const email = `${TAG}-${label}@example.com`;
    const password = randomPassword();
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw new Error('create ' + label + ': ' + made.error.message);
    created.users.push(made.data.user.id);
    must(await admin.from('profiles').insert({ id: made.data.user.id, email, ...profile }), 'profile ' + label);
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    must(await c.auth.signInWithPassword({ email, password }), 'login ' + label);
    return { c, id: made.data.user.id };
  };
  const readById = async (who, id) => ((await who.c.from('foods').select('id').eq('id', id)).data ?? []).length;
  const searchIds = async (who, q) => ((await who.c.rpc('search_foods', { p_query: q, p_limit: 60 })).data ?? []).map((f) => f.id);
  const diaryFood = async (who, logId) => (await who.c.from('food_diary_entries').select('id, food:foods(id, name, protein)').eq('daily_log_id', logId)).data ?? [];
  const today = new Date().toISOString().slice(0, 10);

  try {
    // ---------------------------------------------------------------- fixtures
    const gym = must(await admin.from('gyms').insert({ name: TAG + ' gym' }).select('id').single(), 'gym');
    const otherGym = must(await admin.from('gyms').insert({ name: TAG + ' other gym' }).select('id').single(), 'other gym');
    created.gyms.push(gym.id, otherGym.id);
    const X = await mkUser('coach-x', { role: 'coach', gym_id: gym.id, is_gym_admin: false });
    const Y = await mkUser('coach-y', { role: 'coach', gym_id: gym.id, is_gym_admin: false });
    const Z = await mkUser('coach-z', { role: 'coach', gym_id: otherGym.id, is_gym_admin: false });
    must(await admin.from('coach_gym_memberships').insert([
      { coach_id: X.id, gym_id: gym.id, is_gym_admin: false },
      { coach_id: Y.id, gym_id: gym.id, is_gym_admin: false },
      { coach_id: Z.id, gym_id: otherGym.id, is_gym_admin: false },
    ]), 'coach memberships');
    const A = await mkUser('member-a', { role: 'client', coach_id: X.id, gym_id: gym.id });
    const B = await mkUser('member-b', { role: 'client', coach_id: Y.id, gym_id: gym.id });
    const anon = { c: mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) };

    // ---------------------------------------------------------------- saving
    console.log('Saving an own food');
    const wrap = { name: TAG + ' Cafe wrap', portion: '1 wrap', protein: 32, carbs: 45, fat: 14, source: 'own' };
    const saved = await A.c.from('foods').insert({ ...wrap, owner_id: A.id }).select('id').single();
    check('A saves "Cafe wrap" as their own food', !saved.error, saved.error?.message);
    const food = saved.data?.id;
    if (!food) throw new Error('nothing to check without the saved food');
    check("A cannot save an own food as B's", !!(await A.c.from('foods').insert({ ...wrap, owner_id: B.id }).select('id')).error);
    check('A cannot save a food with source seed', !!(await A.c.from('foods').insert({ ...wrap, source: 'seed' }).select('id')).error);
    check('A cannot save an own food with a barcode', !!(await A.c.from('foods').insert({ ...wrap, owner_id: A.id, barcode: '9999999000079' }).select('id')).error);
    const perGram = { ...wrap, name: TAG + ' oil', portion: '1 gram', protein: 0, carbs: 0, owner_id: A.id };
    check('A cannot save per-gram fat over 1 g a gram (the form says so first: lib/utils/ownFoods.ts)', !!(await A.c.from('foods').insert({ ...perGram, fat: 1.02 }).select('id')).error);
    const oil = await A.c.from('foods').insert({ ...perGram, fat: 1 }).select('id').single();
    check('A can save per-gram fat of 1 g a gram', !oil.error, oil.error?.message);

    // A logs it
    const logA = must(await admin.from('daily_logs').insert({ client_id: A.id, log_date: today }).select('id').single(), 'A daily log').id;
    must(await admin.from('food_diary_entries').insert({ daily_log_id: logA, food_id: food, portions: 1 }), 'A diary row');

    // ---------------------------------------------------------------- reading and finding
    console.log('Reading and finding it');
    check('A reads it by its id', (await readById(A, food)) === 1);
    check('A finds it by searching "wrap"', (await searchIds(A, TAG + ' wrap')).includes(food));
    check('B (a member of another coach) cannot read it by its id', (await readById(B, food)) === 0);
    check('B does not get it in a search', !(await searchIds(B, TAG + ' wrap')).includes(food));
    check('a signed-out caller cannot read it', (await readById(anon, food)) === 0);
    check("A's coach reads it by its id", (await readById(X, food)) === 1);
    const xDiary = await diaryFood(X, logA);
    check("A's coach sees it in A's diary with its figures", xDiary.length === 1 && xDiary[0].food?.id === food, JSON.stringify(xDiary));
    check("A's coach does not get it in their own search", !(await searchIds(X, TAG + ' wrap')).includes(food));
    check("another coach at A's gym reads it by its id (read-only, as A's diary: 0053)", (await readById(Y, food)) === 1);
    const yDiary = await diaryFood(Y, logA);
    check("another coach at A's gym sees it in A's diary with its figures, not as an unknown food", yDiary.length === 1 && yDiary[0].food?.id === food && Number(yDiary[0].food?.protein) === 32, JSON.stringify(yDiary));
    check("another coach at A's gym does not get it in their own search", !(await searchIds(Y, TAG + ' wrap')).includes(food));
    check('a coach at another gym cannot read it by its id', (await readById(Z, food)) === 0);

    // ---------------------------------------------------------------- changing and removing
    console.log('Changing and removing it');
    const upd = await A.c.from('foods').update({ protein: 0 }).eq('id', food).select('id');
    const after = must(await admin.from('foods').select('protein').eq('id', food).single(), 'food after update');
    check('A cannot change its figures', (!!upd.error || (upd.data ?? []).length === 0) && Number(after.protein) === 32);
    const del = await A.c.from('foods').delete().eq('id', food).select('id');
    check('A cannot delete it outright', !!del.error || (del.data ?? []).length === 0);
    const servings = [{ label: 'wrap', grams: 200, default: true }];
    const ySet = await Y.c.rpc('set_food_servings', { p_food_id: food, p_options: servings });
    check("another coach at A's gym cannot set its servings", !!ySet.error || ySet.data === false);
    const xSet = await X.c.rpc('set_food_servings', { p_food_id: food, p_options: servings });
    check("A's coach can set its servings", !xSet.error && xSet.data === true, xSet.error?.message);
    const bRemove = await B.c.rpc('remove_own_food', { p_food_id: food });
    check('remove_own_food as B returns false', !bRemove.error && bRemove.data === false, bRemove.error?.message);
    const yRemove = await Y.c.rpc('remove_own_food', { p_food_id: food });
    check("remove_own_food as another coach at A's gym returns false", !yRemove.error && yRemove.data === false, yRemove.error?.message);
    const aRemove = await A.c.rpc('remove_own_food', { p_food_id: food });
    check('remove_own_food as A returns true', !aRemove.error && aRemove.data === true, aRemove.error?.message);
    check("it leaves A's search", !(await searchIds(A, TAG + ' wrap')).includes(food));
    const aDiary = await diaryFood(A, logA);
    check("A's diary still shows the logged line with its food", aDiary.length === 1 && aDiary[0].food?.id === food, JSON.stringify(aDiary));

    // ---------------------------------------------------------------- deleting a member who logged one
    console.log('Deleting a member who logged an own food, put it in a recipe and planned it');
    const D = await mkUser('member-d', { role: 'client', coach_id: X.id, gym_id: gym.id });
    const dFood = must(await D.c.from('foods').insert({ ...wrap, name: TAG + ' D wrap', owner_id: D.id }).select('id').single(), 'D own food').id;
    const logD = must(await admin.from('daily_logs').insert({ client_id: D.id, log_date: today }).select('id').single(), 'D daily log').id;
    must(await admin.from('food_diary_entries').insert({ daily_log_id: logD, food_id: dFood, portions: 1 }), 'D diary row');
    const recipe = must(await admin.from('recipes').insert({ client_id: D.id, name: TAG + ' recipe' }).select('id').single(), 'D recipe').id;
    must(await admin.from('recipe_ingredients').insert({ recipe_id: recipe, food_id: dFood, portions: 1 }), 'D recipe ingredient');
    must(await admin.from('meal_plan_entries').insert({ client_id: D.id, section: 'lunch', food_id: dFood, portions: 1 }), 'D planned item');
    const gone = await admin.auth.admin.deleteUser(D.id);
    check('the member can be deleted', !gone.error, gone.error?.message);
    if (!gone.error) created.users.splice(created.users.indexOf(D.id), 1);
    check('their own food went with them', ((await admin.from('foods').select('id').eq('id', dFood)).data ?? []).length === 0);
  } finally {
    // the test members' rows first, so the clean-up does not depend on the check above passing
    if (created.users.length) {
      await admin.from('daily_logs').delete().in('client_id', created.users);
      await admin.from('recipes').delete().in('client_id', created.users);
      await admin.from('meal_plan_entries').delete().in('client_id', created.users);
      await admin.from('foods').delete().in('owner_id', created.users);
    }
    for (const id of created.users) await admin.auth.admin.deleteUser(id);
    if (created.gyms.length) {
      await admin.from('coach_gym_memberships').delete().in('gym_id', created.gyms);
      await admin.from('gyms').delete().in('id', created.gyms);
    }
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
