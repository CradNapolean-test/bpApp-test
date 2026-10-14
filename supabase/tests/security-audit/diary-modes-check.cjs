// The photo diary and manual macro entry (food_photo_entries + the food-photos bucket, manual_macro_entries) and where a diary
// entry may be filed, as members. SANDBOX ONLY: creates and deletes test rows on a day nobody uses (2020-01-03) and puts back
// anything it touches.
//   node supabase/tests/security-audit/diary-modes-check.cjs --ref=<your sandbox project ref> [--expect-0114]
//
// A member must reach only their own photos, macro entries and diary, and must NOT be able to: read, add, change or delete another
// member's; point a photo row at another member's file; or file an entry under another member's meal section. Controls prove the
// legitimate paths still work (upload to their own folder, add, change, delete, their coach reading them).
// The checks marked [0114] only hold once migration 0114 is applied (limits on the photo bucket: size and type; description and
// macro value ranges; a photo row's file must be in the member's own folder; entries only in the member's own sections; a cap
// on entries per day): they are listed as pending until then, and count as failures with --expect-0114. Exit code 1 on any failure.
require('./_safety.cjs');
const fs = require('fs');
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const expect0114 = process.argv.includes('--expect-0114');
const TEST_DATE = '2020-01-03';
const TAG = 'zz-rls-diary';
const uuid = () => crypto.randomUUID();
// A real 1x1 PNG.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // member under test
  const O = await login('member.a.sandbox@example.com'); // someone else
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  const failures = [];
  const needs0114 = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const check0114 = (label, pass, detail) => { if (pass) ok(label + ' [0114]'); else needs0114.push(label + (detail ? ' (' + detail + ')' : '')); };
  const refused = (r) => !!r.error;
  const denied = (r) => !!r.error || (r.data ?? []).length === 0;

  const files = [];
  const logs = [];
  const sections = [];

  async function preClean() {
    for (const c of [S, O]) {
      const l = (await admin.from('daily_logs').select('id').eq('client_id', c.id).eq('log_date', TEST_DATE)).data ?? [];
      for (const r of l) {
        await admin.from('food_photo_entries').delete().eq('daily_log_id', r.id);
        await admin.from('manual_macro_entries').delete().eq('daily_log_id', r.id);
        await admin.from('food_diary_entries').delete().eq('daily_log_id', r.id);
        await admin.from('daily_logs').delete().eq('id', r.id);
      }
    }
    await admin.from('meal_sections').delete().like('label', TAG + '%');
  }

  try {
    await preClean();
    const sLog = must(await S.c.from('daily_logs').upsert({ client_id: S.id, log_date: TEST_DATE }, { onConflict: 'client_id,log_date' }).select('id').single(), 'S log');
    const oLog = must(await O.c.from('daily_logs').upsert({ client_id: O.id, log_date: TEST_DATE }, { onConflict: 'client_id,log_date' }).select('id').single(), 'O log');
    logs.push(sLog.id, oLog.id);
    const sSec = must(await admin.from('meal_sections').insert({ client_id: S.id, label: TAG + ' mine', sort_order: 50 }).select('id').single(), 'S section');
    const oSec = must(await admin.from('meal_sections').insert({ client_id: O.id, label: TAG + ' theirs', sort_order: 50 }).select('id').single(), 'O section');
    sections.push(sSec.id, oSec.id);

    // ================= the photo diary =================
    const sPath = `${S.id}/${sLog.id}-${uuid()}.png`;
    const oPath = `${O.id}/${oLog.id}-${uuid()}.png`;
    files.push(sPath, oPath);
    const up = await S.c.storage.from('food-photos').upload(sPath, PNG, { contentType: 'image/png' });
    check('a member uploads a photo to their own folder', !up.error, up.error?.message);
    must(await admin.storage.from('food-photos').upload(oPath, PNG, { contentType: 'image/png' }), "O's photo");

    const upOther = await S.c.storage.from('food-photos').upload(`${O.id}/${oLog.id}-${uuid()}.png`, PNG, { contentType: 'image/png' });
    check("a member cannot upload into another member's folder", refused(upOther));
    const dlOther = await S.c.storage.from('food-photos').download(oPath);
    check("a member cannot download another member's photo", !!dlOther.error);
    const signOther = await S.c.storage.from('food-photos').createSignedUrl(oPath, 60);
    check("a member cannot get a link to another member's photo", !!signOther.error || !signOther.data?.signedUrl);
    const rmOther = await S.c.storage.from('food-photos').remove([oPath]);
    const stillThere = await admin.storage.from('food-photos').download(oPath);
    check("a member cannot delete another member's photo", !stillThere.error, JSON.stringify(rmOther.error));

    const photo = must(await S.c.from('food_photo_entries').insert({ daily_log_id: sLog.id, storage_path: sPath, description: TAG + ' lunch' }).select('*').single(), 'S photo row');
    check('a member adds a photo row on their own day', !!photo.id);
    const oPhoto = must(await admin.from('food_photo_entries').insert({ daily_log_id: oLog.id, storage_path: oPath, description: TAG + ' theirs' }).select('id').single(), 'O photo row');

    check("a member cannot read another member's photo rows", denied(await S.c.from('food_photo_entries').select('id').eq('id', oPhoto.id)));
    check("a member cannot add a photo row to another member's day", refused(await S.c.from('food_photo_entries').insert({ daily_log_id: oLog.id, storage_path: sPath })));
    const moveRow = await S.c.from('food_photo_entries').update({ daily_log_id: oLog.id }).eq('id', photo.id).select('id');
    check("a member cannot move a photo row to another member's day", denied(moveRow));
    check("a member cannot change another member's photo row", denied(await S.c.from('food_photo_entries').update({ description: 'hacked' }).eq('id', oPhoto.id).select('id')));
    check("a member cannot delete another member's photo row", denied(await S.c.from('food_photo_entries').delete().eq('id', oPhoto.id).select('id')));
    check('a coach can read their member\'s photo rows (control)', (must(await coach.c.from('food_photo_entries').select('id').eq('id', photo.id), 'coach read')).length === 1);
    check('signed out reads nothing', ((await anon.from('food_photo_entries').select('id').eq('id', photo.id)).data ?? []).length === 0);
    check('a member changes their own description (control)', !(await S.c.from('food_photo_entries').update({ description: TAG + ' lunch (edited)' }).eq('id', photo.id)).error);

    // [0114]
    check0114('a photo row cannot point at another member\'s file', refused(await S.c.from('food_photo_entries').insert({ daily_log_id: sLog.id, storage_path: oPath })));
    check0114('a photo row cannot be re-pointed at another member\'s file', denied(await S.c.from('food_photo_entries').update({ storage_path: oPath }).eq('id', photo.id).select('id')));
    check0114('a description over 500 characters is refused', refused(await S.c.from('food_photo_entries').insert({ daily_log_id: sLog.id, storage_path: sPath, description: 'x'.repeat(501) })));
    check0114('a negative estimate is refused', refused(await S.c.from('food_photo_entries').update({ estimated_protein: -5 }).eq('id', photo.id)));
    check0114('an absurd estimate is refused', refused(await S.c.from('food_photo_entries').update({ estimated_calories: 1e9 }).eq('id', photo.id)));
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const bigPath = `${S.id}/${sLog.id}-big-${uuid()}.png`;
    files.push(bigPath);
    check0114('a photo over 10 MB is refused', refused(await S.c.storage.from('food-photos').upload(bigPath, big, { contentType: 'image/png' })));
    const htmlPath = `${S.id}/${sLog.id}-page-${uuid()}.html`;
    files.push(htmlPath);
    check0114('a file that is not an image is refused', refused(await S.c.storage.from('food-photos').upload(htmlPath, Buffer.from('<script>1</script>'), { contentType: 'text/html' })));

    // cap per day
    const capRows = Array.from({ length: 39 }, (_, i) => ({ daily_log_id: sLog.id, storage_path: `${S.id}/${sLog.id}-cap-${i}.png` }));
    must(await admin.from('food_photo_entries').insert(capRows), 'cap fill'); // 1 + 39 = 40 on the day
    check0114('a 41st photo on one day is refused', refused(await S.c.from('food_photo_entries').insert({ daily_log_id: sLog.id, storage_path: sPath })));
    await admin.from('food_photo_entries').delete().eq('daily_log_id', sLog.id).like('storage_path', '%-cap-%');

    const del = await S.c.from('food_photo_entries').delete().eq('id', photo.id).select('id');
    check('a member deletes their own photo row (control)', !del.error && (del.data ?? []).length === 1);
    check('a member removes their own file (control)', !(await S.c.storage.from('food-photos').remove([sPath])).error);

    // ================= manual macro entries =================
    const m1 = must(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, meal_section_id: sSec.id, calories: 400, protein: 30, carbs: 40, fat: 10 }).select('id').single(), 'S manual');
    check('a member adds a macro entry on their own day, in their own section (control)', !!m1.id);
    const oM = must(await admin.from('manual_macro_entries').insert({ daily_log_id: oLog.id, protein: 20 }).select('id').single(), 'O manual');
    check("a member cannot read another member's macro entries", denied(await S.c.from('manual_macro_entries').select('id').eq('id', oM.id)));
    check("a member cannot add a macro entry to another member's day", refused(await S.c.from('manual_macro_entries').insert({ daily_log_id: oLog.id, protein: 1 })));
    check("a member cannot move a macro entry to another member's day", denied(await S.c.from('manual_macro_entries').update({ daily_log_id: oLog.id }).eq('id', m1.id).select('id')));
    check("a member cannot change another member's macro entry", denied(await S.c.from('manual_macro_entries').update({ protein: 999 }).eq('id', oM.id).select('id')));
    check("a member cannot delete another member's macro entry", denied(await S.c.from('manual_macro_entries').delete().eq('id', oM.id).select('id')));
    check('a coach can read their member\'s macro entries (control)', (must(await coach.c.from('manual_macro_entries').select('id').eq('id', m1.id), 'coach manual')).length === 1);
    check('a member changes their own macro entry (control)', !(await S.c.from('manual_macro_entries').update({ protein: 35 }).eq('id', m1.id)).error);

    for (const field of ['calories', 'protein', 'carbs', 'fat']) {
      check0114(`a negative ${field} is refused`, refused(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, [field]: -1 })));
      check0114(`an absurd ${field} is refused`, refused(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, [field]: 1e9 })));
    }
    check0114('a macro entry cannot be filed under another member\'s section', refused(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, meal_section_id: oSec.id, protein: 5 })));
    check0114('a macro entry cannot be moved into another member\'s section', denied(await S.c.from('manual_macro_entries').update({ meal_section_id: oSec.id }).eq('id', m1.id).select('id')));
    check('a macro entry with no section is fine (control)', !(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, protein: 5 })).error);

    const manualFill = Array.from({ length: 98 }, () => ({ daily_log_id: sLog.id, protein: 1 }));
    must(await admin.from('manual_macro_entries').insert(manualFill), 'manual fill');
    const count = (must(await admin.from('manual_macro_entries').select('id').eq('daily_log_id', sLog.id), 'count')).length;
    check0114('a macro entry beyond 100 on one day is refused', refused(await S.c.from('manual_macro_entries').insert({ daily_log_id: sLog.id, protein: 1 })) || count < 100, 'count ' + count);
    check('a member deletes their own macro entry (control)', !(await S.c.from('manual_macro_entries').delete().eq('id', m1.id)).error);

    // ================= food diary entries: where they may be filed =================
    const d1 = must(await S.c.from('food_diary_entries').insert({ daily_log_id: sLog.id, quick_add_name: TAG, quick_add_calories: 100, meal_section_id: sSec.id }).select('id').single(), 'S diary');
    check('a member files a diary entry under their own section (control)', !!d1.id);
    check('a member refiles it to no section (control)', !(await S.c.from('food_diary_entries').update({ meal_section_id: null }).eq('id', d1.id)).error);
    check0114('a diary entry cannot be filed under another member\'s section', refused(await S.c.from('food_diary_entries').insert({ daily_log_id: sLog.id, quick_add_name: TAG, quick_add_calories: 1, meal_section_id: oSec.id })));
    check0114('a diary entry cannot be moved into another member\'s section', denied(await S.c.from('food_diary_entries').update({ meal_section_id: oSec.id }).eq('id', d1.id).select('id')));
    check("a member cannot change another member's meal section (control)", denied(await S.c.from('meal_sections').update({ label: 'hacked' }).eq('id', oSec.id).select('id')));
  } finally {
    await preClean();
    for (const p of files) await admin.storage.from('food-photos').remove([p]).catch(() => {});
  }

  console.log('\n' + failures.length + ' failure(s)' + (needs0114.length ? ', ' + needs0114.length + ' check(s) pending until 0114 is applied' : ''));
  for (const f of failures) console.log('  FAIL:', f);
  if (needs0114.length) {
    console.log('\nNeeds 0114:');
    for (const f of needs0114) console.log('  -', f);
  }
  if (expect0114 && needs0114.length) process.exit(1);
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(2); });
