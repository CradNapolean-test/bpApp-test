// A member may cache a scanned, barcoded, per-gram product in the shared foods table, and nothing else.
// SANDBOX ONLY (creates and deletes a few test rows):
//   node supabase/tests/security-audit/foods-write-check.cjs --ref=<your sandbox project ref>
// Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '../../..');
require(root + '/node_modules/dotenv').config({ path: root + '/apps/web/.env.local', quiet: true });
const { createClient } = require(root + '/node_modules/@supabase/supabase-js');

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const refArg = (process.argv.find((a) => a.startsWith('--ref=')) || '').slice(6);
if (!refArg || refArg !== (url.match(/^https:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1]) {
  console.error('Refusing to run: pass --ref=<sandbox project ref> matching NEXT_PUBLIC_SUPABASE_URL.');
  process.exit(2);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));

(async () => {
  const A = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: le } = await A.auth.signInWithPassword({ email: 'member.a.sandbox@example.com', password: creds['member.a.sandbox@example.com'] });
  if (le) throw le;
  const failures = [];
  const created = [];
  const good = { barcode: '9999999000017', name: 'Audit scanned product', portion: '1 gram', protein: 0.1, carbs: 0.5, fat: 0.2, source: 'scan' };
  const cases = [
    ['valid scanned product is allowed', good, true],
    ['no barcode (fake generic food) is blocked', { ...good, barcode: null, name: 'Audit fake generic' }, false],
    ['source other than scan is blocked', { ...good, barcode: '9999999000024', source: 'seed' }, false],
    ['absurd macros (more than 100% by weight) are blocked', { ...good, barcode: '9999999000031', protein: 0.9, carbs: 0.9, fat: 0.9 }, false],
    ['negative macros are blocked', { ...good, barcode: '9999999000048', protein: -1 }, false],
    ['non-numeric barcode is blocked', { ...good, barcode: 'ABC-123-XYZ' }, false],
    ['per-item portion is blocked', { ...good, barcode: '9999999000055', portion: '1 Egg' }, false],
    ['over-long name is blocked', { ...good, barcode: '9999999000062', name: 'x'.repeat(300) }, false],
  ];
  for (const [label, row, shouldWork] of cases) {
    const { data, error } = await A.from('foods').insert(row).select('id').maybeSingle();
    const worked = !error;
    if (data?.id) created.push(data.id);
    if (worked !== shouldWork) failures.push(label + (worked ? ' (it was ALLOWED)' : ' (it was BLOCKED: ' + error.message + ')'));
    else console.log('  ok:', label);
  }
  const upd = await A.from('foods').update({ protein: 0 }).eq('name', 'Chicken Breast').select();
  if ((upd.data?.length ?? 0) > 0) failures.push('member can edit an existing food');
  else console.log('  ok: member cannot edit an existing food');
  const del = await A.from('foods').delete().eq('name', 'Chicken Breast').select();
  if ((del.data?.length ?? 0) > 0) failures.push('member can delete an existing food');
  else console.log('  ok: member cannot delete an existing food');

  for (const id of created) await admin.from('foods').delete().eq('id', id);
  console.log(`\n${cases.length + 2} checks, ${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
