// Shared barcode foods (owner's list item 6, migration 0173): adding a product nobody has added yet, one shared food per barcode, who can
// see who added it, and the limits. These are the write checks listed in 0173's header, run against a real database.
// SANDBOX ONLY: it creates and deletes its own test gyms, accounts (zz-barcodefoods-*@example.com) and products (barcodes 99173000000xx);
// the sandbox members are not touched.
//   node supabase/tests/security-audit/barcode-foods-check.cjs --ref=<your sandbox project ref>
// Needs migration 0173 applied to the sandbox. Exit code 1 on any failure, 2 on a script error.
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
const TAG = 'zz-barcodefoods';
const PREFIX = '99173000000';
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
  // per gram, as the app sends them: a protein bar of 20 g protein, 22 g carbs and 8 g fat in 100 g
  const bar = (barcode, extra = {}) => ({ p_barcode: barcode, p_name: TAG + ' bar', p_brand: 'Test brand', p_protein: 0.2, p_carbs: 0.22, p_fat: 0.08, p_serving_options: [{ label: 'bar', grams: 45, default: true }], ...extra });
  const add = (who, args) => who.c.rpc('add_barcode_food', args);
  const additionsSeen = async (who, foodId) => ((await who.c.from('food_additions').select('food_id').eq('food_id', foodId)).data ?? []).length;

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
    const B = await mkUser('member-b', { role: 'client', coach_id: Z.id, gym_id: otherGym.id });
    const anon = { c: mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) };

    // ---------------------------------------------------------------- adding
    console.log('Adding a product');
    // a 12-digit UPC-A; the same product as a 13-digit EAN is 0 + these digits
    const upc = PREFIX + '1';
    const first = await add(A, bar(upc));
    check('A adds a product nobody has added', !first.error && first.data?.existing === false, first.error?.message);
    const foodId = first.data?.food?.id;
    if (!foodId) throw new Error('nothing to check without the added product');
    const row = must(await admin.from('foods').select('source, owner_id, portion, barcode, brand').eq('id', foodId).single(), 'the added row');
    check('it is a shared scanned product, per gram, with no owner', row.source === 'scan' && row.owner_id === null && row.portion === '1 gram' && row.barcode === upc, JSON.stringify(row));
    check('B (another gym) finds it by its barcode', ((await B.c.from('foods').select('id').eq('barcode', upc)).data ?? []).length === 1);
    const again = await add(B, bar('0' + upc, { p_name: TAG + ' other name', p_protein: 0.5 }));
    check("B adding the same product as a 13-digit EAN gets A's food, not a second one", again.data?.existing === true && again.data?.food?.id === foodId, again.error?.message);
    check('there is still one food for that product', ((await admin.from('foods').select('id').in('barcode', [upc, '0' + upc])).data ?? []).length === 1);
    check('a signed-out caller cannot add', !!(await add(anon, bar(PREFIX + '2'))).error);

    console.log('The figures are checked');
    check('protein over 1 g a gram is refused', !!(await add(A, bar(PREFIX + '3', { p_protein: 1.2 }))).error);
    check('protein, carbs and fat over 1.05 g a gram together are refused', !!(await add(A, bar(PREFIX + '3', { p_protein: 0.5, p_carbs: 0.5, p_fat: 0.1 }))).error);
    check('all 0 is refused', !!(await add(A, bar(PREFIX + '3', { p_protein: 0, p_carbs: 0, p_fat: 0 }))).error);
    check('a name over 100 characters is refused', !!(await add(A, bar(PREFIX + '3', { p_name: 'x'.repeat(101) }))).error);
    check('a barcode of letters is refused', !!(await add(A, bar('ABCDEFGH'))).error);
    check('a bad serving is refused', !!(await add(A, bar(PREFIX + '3', { p_serving_options: [{ label: '', grams: -1 }] }))).error);

    console.log('Who added it');
    check('A sees that they added it', (await additionsSeen(A, foodId)) === 1);
    check("A's coach sees who added it", (await additionsSeen(X, foodId)) === 1);
    check("another coach at A's gym sees who added it", (await additionsSeen(Y, foodId)) === 1);
    check('member B does not', (await additionsSeen(B, foodId)) === 0);
    check('a coach at another gym does not', (await additionsSeen(Z, foodId)) === 0);
    const added = must(await admin.from('food_additions').select('added_by, typed').eq('food_id', foodId).single(), 'the addition');
    check('it is recorded as typed in by A', added.added_by === A.id && added.typed === true, JSON.stringify(added));
    check('a member cannot write food_additions directly', !!(await A.c.from('food_additions').insert({ food_id: foodId, added_by: B.id })).error);
    await X.c.from('food_additions').update({ added_by: X.id }).eq('food_id', foodId);
    check('a coach cannot change who added it', (await admin.from('food_additions').select('added_by').eq('food_id', foodId).single()).data?.added_by === A.id);

    console.log('Coaches correct and hide it');
    const fixed = await X.c.from('foods').update({ protein: 0.21 }).eq('id', foodId).select('id');
    check('a coach corrects its protein', (fixed.data ?? []).length === 1, fixed.error?.message);
    const byMember = await A.c.from('foods').update({ protein: 0.9 }).eq('id', foodId).select('id');
    check('a member cannot change it', (byMember.data ?? []).length === 0);
    must(await X.c.from('foods').update({ hidden: true }).eq('id', foodId), 'hide');
    const hidden = await add(B, bar(upc));
    check('adding a product a coach hid is refused', !!hidden.error && /taken this product off/.test(hidden.error.message), hidden.error?.message);
    // straight into foods under the 0106 rule, as a 14-digit spelling the unique column does not see as the same: that would undo the hide
    const direct = await B.c.from('foods').insert({ barcode: '00' + upc, source: 'scan', portion: '1 gram', name: TAG + ' direct', protein: 0.1, carbs: 0.1, fat: 0.1 });
    check('inserting it straight into foods under another spelling is refused as a duplicate', direct.error?.code === '23505', direct.error?.message);

    console.log('At most 30 new products a day for a member');
    let refused = null;
    for (let i = 10; i < 45 && !refused; i++) {
      const r = await add(A, bar(PREFIX.slice(0, -1) + String(i).padStart(3, '0')));
      if (r.error) refused = { i, message: r.error.message };
    }
    // A has already added 1 above, so the 30th more is the 31st of the day
    check('the 31st product of the day is refused', refused?.i === 39 && /a lot of new products/.test(refused.message), JSON.stringify(refused));
  } finally {
    must(await admin.from('foods').delete().like('barcode', PREFIX.slice(0, -1) + '%'), 'clean-up products');
    must(await admin.from('foods').delete().in('barcode', ['0' + PREFIX + '1', '00' + PREFIX + '1']), 'clean-up other spellings');
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
