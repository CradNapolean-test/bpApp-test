// Chat isolation (messages, read marks, and the chat-photos / voice-notes buckets) as a member. SANDBOX ONLY: creates and
// deletes test rows and files (all named rls-chat-...).
//   node supabase/tests/security-audit/chat-storage-check.cjs --ref=<your sandbox project ref>
//
// A member must reach only their own thread and files. They must NOT be able to: read, write, sign, download, list,
// overwrite or delete another member's messages or files; post a message as someone else; change or delete a sent
// message; touch another member's read mark; or write outside a member folder (no folder, a non-uuid folder, `..`).
// Unauthenticated callers get nothing. Controls prove the legitimate paths still work (own thread, own files, the
// coach reading and posting into an assigned member's thread).
// The last group needs migration 0108 (text length, file size and type limits). Exit code 1 on any failure.
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
const WAV = Buffer.concat([Buffer.from('RIFF$\0\0\0WAVEfmt \x10\0\0\0\x01\0\x01\0\x40\x1f\0\0\x80\x3e\0\0\x02\0\x10\0data\0\0\0\0', 'binary')]);
const BUCKETS = [
  { id: 'chat-photos', body: PNG, type: 'image/png', ext: 'png' },
  { id: 'voice-notes', body: WAV, type: 'audio/wav', ext: 'wav' },
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

  const failures = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const stamp = Date.now();

  // ---- messages and read marks ----
  const msg = (who, over) => who.c.from('chat_messages').insert({ client_id: who.id, sender_id: who.id, text: 'rls-chat-' + stamp, ...over }).select('id');
  const mine = await msg(A, { text: 'rls-chat-A own ' + stamp });
  check('control: a member posts into their own thread', !mine.error && mine.data?.length === 1, mine.error?.message);
  const aMsgId = mine.data?.[0]?.id;
  const bMsg = must(await admin.from('chat_messages').insert({ client_id: B.id, sender_id: B.id, text: 'rls-chat-B secret ' + stamp }).select('id').single(), 'seed B message');

  const readB = await A.c.from('chat_messages').select('id').eq('client_id', B.id);
  check("cannot read another member's messages", !readB.error && (readB.data ?? []).length === 0, 'saw ' + (readB.data ?? []).length);
  const intoB = await A.c.from('chat_messages').insert({ client_id: B.id, sender_id: A.id, text: 'rls-chat-intruder' }).select('id');
  check("cannot post into another member's thread", !!intoB.error || (intoB.data ?? []).length === 0, 'inserted');
  const spoofB = await A.c.from('chat_messages').insert({ client_id: A.id, sender_id: B.id, text: 'rls-chat-spoof' }).select('id');
  check('cannot post into own thread as another member', !!spoofB.error || (spoofB.data ?? []).length === 0, 'inserted');
  const spoofCoach = await A.c.from('chat_messages').insert({ client_id: A.id, sender_id: coachOfA, text: 'rls-chat-spoof-coach' }).select('id');
  check('cannot post into own thread as their coach', !!spoofCoach.error || (spoofCoach.data ?? []).length === 0, 'inserted');
  const upd = await A.c.from('chat_messages').update({ text: 'rls-chat-edited' }).eq('id', aMsgId).select('id');
  check('cannot edit a sent message (immutable)', (upd.data ?? []).length === 0, 'edited');
  const del = await A.c.from('chat_messages').delete().eq('id', aMsgId).select('id');
  check('cannot delete a sent message (immutable)', (del.data ?? []).length === 0, 'deleted');
  const updB = await A.c.from('chat_messages').update({ text: 'rls-chat-edited' }).eq('id', bMsg.id).select('id');
  const delB = await A.c.from('chat_messages').delete().eq('id', bMsg.id).select('id');
  check("cannot edit or delete another member's message", (updB.data ?? []).length === 0 && (delB.data ?? []).length === 0);
  const stillB = must(await admin.from('chat_messages').select('text').eq('id', bMsg.id).single(), 'recheck B').text;
  check("another member's message is unchanged", stillB === 'rls-chat-B secret ' + stamp);

  const thB = await A.c.from('chat_threads').select('client_id').eq('client_id', B.id);
  check("cannot read another member's read mark", !thB.error && (thB.data ?? []).length === 0);
  const wrThB = await A.c.from('chat_threads').upsert({ client_id: B.id, client_last_read_at: new Date().toISOString() }).select('client_id');
  check("cannot write another member's read mark directly", !!wrThB.error || (wrThB.data ?? []).length === 0);
  const wrThA = await A.c.from('chat_threads').upsert({ client_id: A.id, client_last_read_at: '2000-01-01T00:00:00Z' }).select('client_id');
  check('cannot write own read mark directly (only through mark_chat_read)', !!wrThA.error || (wrThA.data ?? []).length === 0);
  const markB = await A.c.rpc('mark_chat_read', { p_client_id: B.id });
  check("mark_chat_read refuses another member's thread", !!markB.error);
  const markA = await A.c.rpc('mark_chat_read', { p_client_id: A.id });
  check('control: mark_chat_read works for own thread', !markA.error, markA.error?.message);

  const anonRead = await anon.from('chat_messages').select('id').limit(1);
  check('signed-out callers read no messages', !anonRead.error ? (anonRead.data ?? []).length === 0 : true);

  // ---- files ----
  const tracked = []; // [bucket, path] to clean up
  const put = async (client, bucket, p, body, type, opts = {}) => {
    tracked.push([bucket, p]);
    return client.storage.from(bucket).upload(p, body, { contentType: type, ...opts });
  };
  for (const b of BUCKETS) {
    console.log(`  -- bucket ${b.id}`);
    const aPath = `${A.id}/rls-chat-${stamp}-own.${b.ext}`;
    const bPath = `${B.id}/rls-chat-${stamp}-b.${b.ext}`;
    const up = await put(A.c, b.id, aPath, b.body, b.type);
    check(`control: a member uploads into their own folder`, !up.error, up.error?.message);
    must(await put(admin, b.id, bPath, b.body, b.type), 'seed B file');

    const own = await A.c.storage.from(b.id).createSignedUrl(aPath, 60);
    check('control: a member signs a link to their own file', !own.error && !!own.data?.signedUrl, own.error?.message);
    const dl = await A.c.storage.from(b.id).download(aPath);
    check('control: a member downloads their own file', !dl.error, dl.error?.message);

    const toB = await put(A.c, b.id, `${B.id}/rls-chat-${stamp}-intruder.${b.ext}`, b.body, b.type);
    check("cannot upload into another member's folder", !!toB.error);
    const signB = await A.c.storage.from(b.id).createSignedUrl(bPath, 60);
    check("cannot sign a link to another member's file", !!signB.error || !signB.data?.signedUrl);
    const dlB = await A.c.storage.from(b.id).download(bPath);
    check("cannot download another member's file", !!dlB.error);
    const lsB = await A.c.storage.from(b.id).list(B.id);
    check("cannot list another member's folder", !lsB.error ? (lsB.data ?? []).length === 0 : true, 'listed ' + (lsB.data ?? []).length);

    const loose = await put(A.c, b.id, `rls-chat-${stamp}-loose.${b.ext}`, b.body, b.type);
    check('cannot upload outside a member folder (no folder)', !!loose.error);
    const junk = await put(A.c, b.id, `not-a-uuid/rls-chat-${stamp}.${b.ext}`, b.body, b.type);
    check('cannot upload under a non-uuid folder', !!junk.error);
    const trav = await put(A.c, b.id, `${A.id}/../${B.id}/rls-chat-${stamp}-trav.${b.ext}`, b.body, b.type);
    const lsAfter = (await admin.storage.from(b.id).list(B.id)).data ?? [];
    check("a '..' path cannot reach another member's folder", !lsAfter.some((f) => f.name.includes(`-${stamp}-trav`)), 'landed in B folder' + (trav.error ? '' : ' (upload accepted)'));

    const over = await put(A.c, b.id, aPath, Buffer.concat([b.body, Buffer.from('changed')]), b.type, { upsert: true });
    const sizeNow = (await admin.storage.from(b.id).list(A.id, { search: `rls-chat-${stamp}-own` })).data?.[0]?.metadata?.size;
    check('cannot overwrite an existing file', !!over.error && sizeNow === b.body.length, 'size now ' + sizeNow);
    const rmOwn = await A.c.storage.from(b.id).remove([aPath]);
    const rmB = await A.c.storage.from(b.id).remove([bPath]);
    const aStill = (await admin.storage.from(b.id).list(A.id, { search: `rls-chat-${stamp}-own` })).data ?? [];
    const bStill = (await admin.storage.from(b.id).list(B.id, { search: `rls-chat-${stamp}-b` })).data ?? [];
    check('cannot delete files (own or anyone else\'s)', aStill.length === 1 && bStill.length === 1 && (rmOwn.data ?? []).length === 0 && (rmB.data ?? []).length === 0);

    const anonSign = await anon.storage.from(b.id).createSignedUrl(aPath, 60);
    check('signed-out callers cannot sign links', !!anonSign.error || !anonSign.data?.signedUrl);
    const anonUp = await put(anon, b.id, `${A.id}/rls-chat-${stamp}-anon.${b.ext}`, b.body, b.type);
    check('signed-out callers cannot upload', !!anonUp.error);

    if (coachIsAssigned) {
      const cs = await coach.c.storage.from(b.id).createSignedUrl(aPath, 60);
      check("control: the member's coach can sign a link to their file", !cs.error && !!cs.data?.signedUrl, cs.error?.message);
      const cu = await put(coach.c, b.id, `${A.id}/rls-chat-${stamp}-coach.${b.ext}`, b.body, b.type);
      check("control: the member's coach can upload into their thread folder", !cu.error, cu.error?.message);
    }
  }
  if (coachIsAssigned) {
    const cm = await coach.c.from('chat_messages').insert({ client_id: A.id, sender_id: coach.id, text: 'rls-chat-coach reply ' + stamp }).select('id');
    check("control: the member's coach posts into their thread", !cm.error && cm.data?.length === 1, cm.error?.message);
    const cr = await coach.c.from('chat_messages').select('id').eq('client_id', A.id).limit(1);
    check("control: the member's coach reads their thread", !cr.error && (cr.data ?? []).length === 1, cr.error?.message);
  } else {
    console.log("  (skipped coach controls: coach.sandbox is not member A's coach)");
  }

  // ---- limits (migration 0108) ----
  console.log('  -- limits (need migration 0108)');
  const long = await msg(A, { text: 'rls-chat-long ' + 'x'.repeat(4001) });
  check('a message over 4000 characters is refused', !!long.error, 'accepted');
  const exact = await msg(A, { text: 'rls-chat-edge ' + 'x'.repeat(4000 - 'rls-chat-edge '.length) });
  check('control: a message of exactly 4000 characters is accepted', !exact.error, exact.error?.message);
  const html = await put(A.c, 'chat-photos', `${A.id}/rls-chat-${stamp}-page.html`, Buffer.from('<script>1</script>'), 'text/html');
  check('chat-photos refuses a non-image (text/html)', !!html.error, 'accepted');
  const htmlV = await put(A.c, 'voice-notes', `${A.id}/rls-chat-${stamp}-page.html`, Buffer.from('<script>1</script>'), 'text/html');
  check('voice-notes refuses a non-audio file (text/html)', !!htmlV.error, 'accepted');
  const big = await put(A.c, 'chat-photos', `${A.id}/rls-chat-${stamp}-big.png`, Buffer.alloc(11 * 1024 * 1024, 1), 'image/png');
  check('chat-photos refuses a file over 10 MB', !!big.error, 'accepted');

  // ---- cleanup ----
  for (const [bucket, p] of tracked) await admin.storage.from(bucket).remove([p]);
  for (const bucket of ['chat-photos', 'voice-notes']) {
    for (const folder of [A.id, B.id]) {
      const left = ((await admin.storage.from(bucket).list(folder, { search: `rls-chat-${stamp}` })).data ?? []).map((f) => `${folder}/${f.name}`);
      if (left.length) await admin.storage.from(bucket).remove(left);
    }
  }
  await admin.from('chat_messages').delete().like('text', 'rls-chat-%');

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
