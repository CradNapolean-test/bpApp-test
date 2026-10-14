// Progress isolation (progress_photos, measurement_logs, body_scans and the progress-photos / inbody-scans buckets) as a
// member. SANDBOX ONLY: creates and deletes test rows and files (all tagged rls-prog / dated 2001).
//   node supabase/tests/security-audit/progress-isolation-check.cjs --ref=<your sandbox project ref>
//
// A member must reach only their own rows and files. They must NOT be able to: read, write, edit or delete another
// member's photos, measurements, scans or files; read, sign, download, list, overwrite or delete another member's
// files; or write outside a member folder (no folder, a non-uuid folder, `..`). Unauthenticated callers get nothing.
// Controls prove the legitimate paths still work (the member's own rows and files, and the assigned coach reading them,
// and adding scans and printouts, which the web lets a coach do).
// The last group needs migration 0109 (value ranges, note length, file size and type limits). Exit code 1 on any failure.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const PDF = Buffer.from('%PDF-1.1\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF');
const BUCKETS = [
  { id: 'progress-photos', table: 'progress_photos' },
  { id: 'inbody-scans', table: 'body_scans' },
];

(async () => {
  const login = async (email) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const A = await login('member.a.sandbox@example.com');
  const B = await login('member.b.sandbox@example.com');
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const coachOfA = must(await admin.from('profiles').select('coach_id').eq('id', A.id).single(), 'A coach').coach_id;
  const coachIsAssigned = coachOfA === coach.id;

  // A run that was interrupted can leave its rows behind (every test row is dated 2001 or tagged rls-prog); clear them first
  // so one crash can never make the next run fail on a duplicate.
  for (const id of [A.id, B.id]) await admin.from('measurement_logs').delete().eq('client_id', id).gte('log_date', '2001-01-01').lt('log_date', '2002-01-01');
  await admin.from('body_scans').delete().like('notes', 'rls-prog-%');
  await admin.from('progress_photos').delete().like('storage_path', '%rls-prog-%');

  const failures = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const denied = (r) => !!r.error || (r.data ?? []).length === 0; // an RLS refusal is either an error or zero rows
  const stamp = Date.now();
  const tracked = [];
  const put = async (client, bucket, p, body, type, opts = {}) => {
    tracked.push([bucket, p]);
    return client.storage.from(bucket).upload(p, body, { contentType: type, ...opts });
  };

  // ---- progress_photos ----
  console.log('  -- progress_photos');
  const aPhotoPath = `${A.id}/2001-01-01-rls-prog-${stamp}.png`;
  must(await put(A.c, 'progress-photos', aPhotoPath, PNG, 'image/png'), 'A upload');
  const ins = await A.c.from('progress_photos').insert({ client_id: A.id, photo_date: '2001-01-01', storage_path: aPhotoPath }).select('id');
  check('control: a member adds their own photo', !ins.error && ins.data?.length === 1, ins.error?.message);
  const aPhotoId = ins.data?.[0]?.id;
  const bPhotoPath = `${B.id}/2001-01-02-rls-prog-${stamp}.png`;
  must(await put(admin, 'progress-photos', bPhotoPath, PNG, 'image/png'), 'seed B photo file');
  const bPhoto = must(await admin.from('progress_photos').insert({ client_id: B.id, photo_date: '2001-01-02', storage_path: bPhotoPath }).select('id').single(), 'seed B photo');

  check("cannot read another member's photo rows", denied(await A.c.from('progress_photos').select('id').eq('client_id', B.id)));
  check("cannot add a photo row for another member", denied(await A.c.from('progress_photos').insert({ client_id: B.id, photo_date: '2001-01-03', storage_path: `${B.id}/x.png` }).select('id')));
  check("cannot change a photo row (own or anyone's)", denied(await A.c.from('progress_photos').update({ photo_date: '2001-01-09' }).eq('id', aPhotoId).select('id')) && denied(await A.c.from('progress_photos').update({ photo_date: '2001-01-09' }).eq('id', bPhoto.id).select('id')));
  check("cannot delete another member's photo row", denied(await A.c.from('progress_photos').delete().eq('id', bPhoto.id).select('id')));
  check("another member's photo row is still there", (await admin.from('progress_photos').select('id').eq('id', bPhoto.id)).data?.length === 1);
  check('signed-out callers read no photo rows', denied(await anon.from('progress_photos').select('id').limit(1)));
  if (coachIsAssigned) {
    const cr = await coach.c.from('progress_photos').select('id').eq('client_id', A.id).limit(1);
    check("control: the member's coach reads their photo rows", !cr.error && (cr.data ?? []).length === 1, cr.error?.message);
    check("a coach cannot add a photo row for a member (members add their own)", denied(await coach.c.from('progress_photos').insert({ client_id: A.id, photo_date: '2001-01-04', storage_path: `${A.id}/y.png` }).select('id')));
  }

  // ---- measurement_logs ----
  console.log('  -- measurement_logs');
  const m1 = await A.c.from('measurement_logs').upsert({ client_id: A.id, log_date: '2001-01-01', waist: 80 }, { onConflict: 'client_id,log_date' }).select('id');
  check('control: a member logs their own measurements', !m1.error && m1.data?.length === 1, m1.error?.message);
  const m2 = await A.c.from('measurement_logs').upsert({ client_id: A.id, log_date: '2001-01-01', waist: 79.5, arm: 33 }, { onConflict: 'client_id,log_date' }).select('waist, arm');
  check('control: logging again the same day updates it', !m2.error && m2.data?.[0]?.waist === 79.5 && m2.data?.[0]?.arm === 33, m2.error?.message);
  const bm = must(await admin.from('measurement_logs').insert({ client_id: B.id, log_date: '2001-01-02', waist: 99 }).select('id').single(), 'seed B measurement');
  check("cannot read another member's measurements", denied(await A.c.from('measurement_logs').select('id').eq('client_id', B.id)));
  check("cannot log measurements for another member", denied(await A.c.from('measurement_logs').insert({ client_id: B.id, log_date: '2001-01-05', waist: 1 }).select('id')));
  check("cannot overwrite another member's measurements by logging on their day", denied(await A.c.from('measurement_logs').upsert({ client_id: B.id, log_date: '2001-01-02', waist: 1 }, { onConflict: 'client_id,log_date' }).select('id')));
  check("cannot edit another member's measurements", denied(await A.c.from('measurement_logs').update({ waist: 1 }).eq('id', bm.id).select('id')));
  check('cannot delete a measurement log (own or anyone\'s)', denied(await A.c.from('measurement_logs').delete().eq('id', bm.id).select('id')) && denied(await A.c.from('measurement_logs').delete().eq('client_id', A.id).eq('log_date', '2001-01-01').select('id')));
  check("another member's measurements are unchanged", (await admin.from('measurement_logs').select('waist').eq('id', bm.id).single()).data?.waist === 99);
  check('signed-out callers read no measurements', denied(await anon.from('measurement_logs').select('id').limit(1)));
  if (coachIsAssigned) {
    const cr = await coach.c.from('measurement_logs').select('id').eq('client_id', A.id).limit(1);
    check("control: the member's coach reads their measurements", !cr.error && (cr.data ?? []).length === 1, cr.error?.message);
    check('a coach cannot log measurements for a member', denied(await coach.c.from('measurement_logs').insert({ client_id: A.id, log_date: '2001-01-06', waist: 1 }).select('id')));
  }

  // ---- body_scans ----
  console.log('  -- body_scans');
  const s1 = await A.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-01-01', weight_kg: 80, notes: `rls-prog-${stamp}` }).select('id');
  check('control: a member adds their own scan', !s1.error && s1.data?.length === 1, s1.error?.message);
  const aScanId = s1.data?.[0]?.id;
  const bScan = must(await admin.from('body_scans').insert({ client_id: B.id, scan_date: '2001-01-02', weight_kg: 90, notes: `rls-prog-B-${stamp}` }).select('id').single(), 'seed B scan');
  const s2 = await A.c.from('body_scans').update({ weight_kg: 81 }).eq('id', aScanId).select('weight_kg');
  check('control: a member edits their own scan', !s2.error && s2.data?.[0]?.weight_kg === 81, s2.error?.message);
  check("cannot read another member's scans", denied(await A.c.from('body_scans').select('id').eq('client_id', B.id)));
  check("cannot add a scan for another member", denied(await A.c.from('body_scans').insert({ client_id: B.id, scan_date: '2001-01-03', weight_kg: 1 }).select('id')));
  check("cannot edit another member's scan", denied(await A.c.from('body_scans').update({ weight_kg: 1 }).eq('id', bScan.id).select('id')));
  check("cannot move a scan into another member's account", denied(await A.c.from('body_scans').update({ client_id: B.id }).eq('id', aScanId).select('id')));
  check("cannot delete another member's scan", denied(await A.c.from('body_scans').delete().eq('id', bScan.id).select('id')));
  check("another member's scan is unchanged", (await admin.from('body_scans').select('weight_kg').eq('id', bScan.id).single()).data?.weight_kg === 90);
  check('signed-out callers read no scans', denied(await anon.from('body_scans').select('id').limit(1)));
  const s3 = await A.c.from('body_scans').delete().eq('id', aScanId).select('id');
  check('control: a member deletes their own scan', !s3.error && s3.data?.length === 1, s3.error?.message);
  if (coachIsAssigned) {
    const cs = await coach.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-01-07', weight_kg: 80, notes: `rls-prog-coach-${stamp}` }).select('id');
    check("control: the member's coach adds a scan for them (the web allows it)", !cs.error && cs.data?.length === 1, cs.error?.message);
  }

  // ---- files ----
  for (const b of BUCKETS) {
    console.log(`  -- bucket ${b.id}`);
    const aPath = `${A.id}/rls-prog-${stamp}-own.png`;
    const bPath = `${B.id}/rls-prog-${stamp}-b.png`;
    check('control: a member uploads into their own folder', !(await put(A.c, b.id, aPath, PNG, 'image/png')).error);
    must(await put(admin, b.id, bPath, PNG, 'image/png'), 'seed B file');
    const own = await A.c.storage.from(b.id).createSignedUrl(aPath, 60);
    check('control: a member signs a link to their own file', !own.error && !!own.data?.signedUrl, own.error?.message);
    check('control: a member downloads their own file', !(await A.c.storage.from(b.id).download(aPath)).error);

    check("cannot upload into another member's folder", !!(await put(A.c, b.id, `${B.id}/rls-prog-${stamp}-intruder.png`, PNG, 'image/png')).error);
    const signB = await A.c.storage.from(b.id).createSignedUrl(bPath, 60);
    check("cannot sign a link to another member's file", !!signB.error || !signB.data?.signedUrl);
    check("cannot download another member's file", !!(await A.c.storage.from(b.id).download(bPath)).error);
    const lsB = await A.c.storage.from(b.id).list(B.id);
    check("cannot list another member's folder", !lsB.error ? (lsB.data ?? []).length === 0 : true, 'listed ' + (lsB.data ?? []).length);
    check('cannot upload outside a member folder (no folder)', !!(await put(A.c, b.id, `rls-prog-${stamp}-loose.png`, PNG, 'image/png')).error);
    check('cannot upload under a non-uuid folder', !!(await put(A.c, b.id, `not-a-uuid/rls-prog-${stamp}.png`, PNG, 'image/png')).error);
    await put(A.c, b.id, `${A.id}/../${B.id}/rls-prog-${stamp}-trav.png`, PNG, 'image/png');
    const lsAfter = (await admin.storage.from(b.id).list(B.id)).data ?? [];
    check("a '..' path cannot reach another member's folder", !lsAfter.some((f) => f.name.includes(`-${stamp}-trav`)));

    const over = await put(A.c, b.id, aPath, Buffer.concat([PNG, Buffer.from('changed')]), 'image/png', { upsert: true });
    const sizeNow = (await admin.storage.from(b.id).list(A.id, { search: `rls-prog-${stamp}-own` })).data?.[0]?.metadata?.size;
    check('cannot overwrite an existing file', !!over.error && sizeNow === PNG.length, 'size now ' + sizeNow);
    await A.c.storage.from(b.id).remove([bPath]);
    check("cannot delete another member's file", ((await admin.storage.from(b.id).list(B.id, { search: `rls-prog-${stamp}-b` })).data ?? []).length === 1);
    const rmOwn = await A.c.storage.from(b.id).remove([aPath]);
    const aGone = ((await admin.storage.from(b.id).list(A.id, { search: `rls-prog-${stamp}-own` })).data ?? []).length === 0;
    check('control: a member deletes their own file', !rmOwn.error && aGone, rmOwn.error?.message);

    const anonSign = await anon.storage.from(b.id).createSignedUrl(`${A.id}/x.png`, 60);
    check('signed-out callers cannot sign links', !!anonSign.error || !anonSign.data?.signedUrl);
    check('signed-out callers cannot upload', !!(await put(anon, b.id, `${A.id}/rls-prog-${stamp}-anon.png`, PNG, 'image/png')).error);

    if (coachIsAssigned) {
      const forCoach = `${A.id}/rls-prog-${stamp}-forcoach.png`;
      must(await put(admin, b.id, forCoach, PNG, 'image/png'), 'seed file for coach');
      const cs = await coach.c.storage.from(b.id).createSignedUrl(forCoach, 60);
      check("control: the member's coach can sign a link to their file", !cs.error && !!cs.data?.signedUrl, cs.error?.message);
      const cu = await put(coach.c, b.id, `${A.id}/rls-prog-${stamp}-coach.png`, PNG, 'image/png');
      if (b.id === 'inbody-scans') check("control: the member's coach can add a printout (the web allows it)", !cu.error, cu.error?.message);
      else check("a coach cannot upload into a member's progress photos (members add their own)", !!cu.error);
    }
  }

  // ---- limits (migration 0109) ----
  console.log('  -- limits (need migration 0109)');
  const lim = async (label, p) => check(label, !!p.error, 'accepted');
  await lim('a waist of 5000 cm is refused', await A.c.from('measurement_logs').upsert({ client_id: A.id, log_date: '2001-02-01', waist: 5000 }, { onConflict: 'client_id,log_date' }).select('id'));
  await lim('a negative measurement is refused', await A.c.from('measurement_logs').upsert({ client_id: A.id, log_date: '2001-02-02', arm: -5 }, { onConflict: 'client_id,log_date' }).select('id'));
  const okM = await A.c.from('measurement_logs').upsert({ client_id: A.id, log_date: '2001-02-03', waist: 300, hips: 10 }, { onConflict: 'client_id,log_date' }).select('id');
  check('control: measurements at the edges (10 and 300 cm) are accepted', !okM.error, okM.error?.message);
  await lim('a body fat of 150% is refused', await A.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-02-01', body_fat_pct: 150, notes: `rls-prog-${stamp}` }).select('id'));
  await lim('a scan weight of 5000 kg is refused', await A.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-02-02', weight_kg: 5000, notes: `rls-prog-${stamp}` }).select('id'));
  await lim('a scan note over 1000 characters is refused', await A.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-02-03', weight_kg: 80, notes: 'rls-prog-' + 'x'.repeat(1001) }).select('id'));
  const okS = await A.c.from('body_scans').insert({ client_id: A.id, scan_date: '2001-02-04', weight_kg: 400, body_fat_pct: 2, visceral_fat_level: 30, notes: `rls-prog-${stamp}` }).select('id');
  check('control: scan figures at the edges are accepted', !okS.error, okS.error?.message);
  await lim('progress-photos refuses a non-image (text/html)', await put(A.c, 'progress-photos', `${A.id}/rls-prog-${stamp}-page.html`, Buffer.from('<script>1</script>'), 'text/html'));
  await lim('progress-photos refuses a file over 10 MB', await put(A.c, 'progress-photos', `${A.id}/rls-prog-${stamp}-big.png`, Buffer.alloc(11 * 1024 * 1024, 1), 'image/png'));
  await lim('inbody-scans refuses a file that is neither an image nor a PDF (text/html)', await put(A.c, 'inbody-scans', `${A.id}/rls-prog-${stamp}-page.html`, Buffer.from('<script>1</script>'), 'text/html'));
  const pdf = await put(A.c, 'inbody-scans', `${A.id}/rls-prog-${stamp}-ok.pdf`, PDF, 'application/pdf');
  check('control: inbody-scans accepts a PDF printout (the web uploads them)', !pdf.error, pdf.error?.message);

  // ---- cleanup ----
  for (const [bucket, p] of tracked) await admin.storage.from(bucket).remove([p]);
  for (const bucket of ['progress-photos', 'inbody-scans']) {
    for (const folder of [A.id, B.id]) {
      const left = ((await admin.storage.from(bucket).list(folder, { search: `rls-prog-${stamp}` })).data ?? []).map((f) => `${folder}/${f.name}`);
      if (left.length) await admin.storage.from(bucket).remove(left);
    }
  }
  await admin.from('progress_photos').delete().like('storage_path', '%rls-prog-%');
  for (const id of [A.id, B.id]) await admin.from('measurement_logs').delete().eq('client_id', id).gte('log_date', '2001-01-01').lt('log_date', '2002-01-01');
  await admin.from('body_scans').delete().like('notes', 'rls-prog-%');

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
