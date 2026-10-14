// Forms, onboarding and the daily check-in, as members. SANDBOX ONLY: creates and deletes test rows (tagged rls-form), one
// throwaway member and one throwaway form, and puts back anything it touches.
//   node supabase/tests/security-audit/forms-onboarding-check.cjs --ref=<your sandbox project ref>
//
// A member must reach only their own forms, answers, check-in days and profile. They must NOT be able to: read another
// member's assignments, answers, days or profile; write forms or answers directly (only submit_form_response writes them);
// submit another member's form or the same form twice; answer a question that is not on their form; send answers of the
// wrong shape, too many answers or an answer of unlimited size; get the gym's default onboarding form assigned to anyone but
// themselves; or store out-of-range check-in figures or unbounded profile text. Controls prove the legitimate paths still
// work (own assignments, a valid submission, the first profile save, a partial check-in save that keeps the other fields).
// The checks marked [0111] only hold once migration 0111 is applied: they are listed as pending until then, and count as
// failures when you run with --expect-0111. The rest must pass either way. Exit code 1 on any failure.
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

const TAG = 'rls-form';
const TEMP_EMAIL_PREFIX = TAG + '-';
const LOG_DATE = '2002-04-05'; // a date no real diary uses

(async () => {
  const login = async (email, password) => {
    const c = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
    const s = must(await c.auth.signInWithPassword({ email, password: password ?? creds[email] }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const S = await login('member.b.sandbox@example.com'); // the member under test
  const O = await login('member.a.sandbox@example.com'); // someone else
  const coach = await login('coach.sandbox@example.com');
  const anon = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const coachProfile = must(await admin.from('profiles').select('id, gym_id').eq('id', coach.id).single(), 'coach profile');

  const failures = [];
  const needs0111 = [];
  const ok = (label) => console.log('  ok:', label);
  const check = (label, pass, detail) => { if (pass) ok(label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  // A check that only holds once migration 0111 is applied: counted separately so the report says what is still pending.
  const check0111 = (label, pass, detail) => { if (pass) ok(label + ' [0111]'); else needs0111.push(label + (detail ? ' (' + detail + ')' : '')); };
  const denied = (r) => !!r.error || (r.data ?? []).length === 0;

  // ---- clean up anything a crashed earlier run left ----
  async function preClean() {
    const stale = (await admin.from('form_templates').select('id').like('name', TAG + '%')).data ?? [];
    for (const t of stale) await admin.from('form_templates').delete().eq('id', t.id);
    const users = (await admin.from('profiles').select('id').like('email', TEMP_EMAIL_PREFIX + '%')).data ?? [];
    for (const u of users) await admin.auth.admin.deleteUser(u.id);
    await admin.from('daily_logs').delete().in('client_id', [S.id, O.id]).eq('log_date', LOG_DATE);
  }
  await preClean();

  // ---- fixtures ----
  const mkTemplate = async (name, isDefault = false) => must(await admin.from('form_templates').insert({ coach_id: coach.id, gym_id: coachProfile.gym_id, name, description: TAG, is_default_onboarding: isDefault }).select('id').single(), 'template ' + name);
  const mkQuestions = async (templateId, defs) => must(await admin.from('form_questions').insert(defs.map((d, i) => ({ template_id: templateId, order_index: i, required: d.required ?? true, question_text: d.text, question_type: d.type, options: d.options ?? null }))).select('id, question_type, order_index').order('order_index'), 'questions');
  const X = await mkTemplate(TAG + ' main');
  const [q1, q2, q3, q4, q5] = await mkQuestions(X.id, [
    { text: 'Short', type: 'short_text' },
    { text: 'Number', type: 'number' },
    { text: 'Single', type: 'single_choice', options: ['a', 'b'] },
    { text: 'Multi', type: 'multi_choice', options: ['a', 'b', 'c'] },
    { text: 'Long', type: 'long_text', required: false },
  ]);
  const Y = await mkTemplate(TAG + ' other');
  const [qy] = await mkQuestions(Y.id, [{ text: 'Elsewhere', type: 'short_text' }]);
  const aS = must(await admin.from('form_assignments').insert({ template_id: X.id, client_id: S.id }).select('id').single(), 'assign S');
  const aO = must(await admin.from('form_assignments').insert({ template_id: X.id, client_id: O.id }).select('id').single(), 'assign O');
  must(await admin.from('form_responses').insert({ assignment_id: aO.id, question_id: q1.id, answer: 'private to O' }), 'seed O response');

  // The gym's default onboarding form: use the one that is there, or make a throwaway one.
  let defaultTemplate = (await admin.from('form_templates').select('id, name').eq('gym_id', coachProfile.gym_id).eq('is_default_onboarding', true).maybeSingle()).data;
  let madeDefault = false;
  if (!defaultTemplate) { defaultTemplate = { ...(await mkTemplate(TAG + ' default', true)), name: TAG + ' default' }; madeDefault = true; }

  // A throwaway member with no profile row yet: the first-save and onboarding cases.
  const tEmail = TEMP_EMAIL_PREFIX + Date.now() + '@example.com';
  const tPassword = crypto.randomBytes(18).toString('base64url');
  const created = must(await admin.auth.admin.createUser({ email: tEmail, password: tPassword, email_confirm: true }), 'create temp member');
  must(await admin.from('profiles').insert({ id: created.user.id, role: 'client', email: tEmail, coach_id: coach.id, gym_id: coachProfile.gym_id }), 'temp member profile');
  const T = await login(tEmail, tPassword);

  const sBefore = (await admin.from('daily_logs').select('id').eq('client_id', S.id).eq('log_date', LOG_DATE)).data ?? [];
  if (sBefore.length) await admin.from('daily_logs').delete().eq('client_id', S.id).eq('log_date', LOG_DATE);

  try {
    // ================= forms =================
    console.log('  -- forms: reading');
    const own = await S.c.from('form_assignments').select('id, template:form_templates(name, questions:form_questions(id))').eq('client_id', S.id).eq('id', aS.id);
    check('control: a member reads their own assignment with its questions', !own.error && own.data?.length === 1 && own.data[0].template?.questions?.length === 5, own.error?.message);
    check("cannot read another member's assignment", denied(await S.c.from('form_assignments').select('id').eq('id', aO.id)));
    check("cannot read another member's answers", denied(await S.c.from('form_responses').select('id').eq('assignment_id', aO.id)));
    check('signed-out callers read no assignments or answers', denied(await anon.from('form_assignments').select('id').limit(1)) && denied(await anon.from('form_responses').select('id').limit(1)));

    console.log('  -- forms: writing');
    check('cannot create an assignment directly (coaches assign forms)', denied(await S.c.from('form_assignments').insert({ template_id: X.id, client_id: S.id }).select('id')));
    check('cannot write an answer directly', denied(await S.c.from('form_responses').insert({ assignment_id: aS.id, question_id: q1.id, answer: 'x' }).select('id')));
    check('cannot mark their own form complete directly', denied(await S.c.from('form_assignments').update({ completed_at: new Date().toISOString() }).eq('id', aS.id).select('id')));
    check("cannot edit or delete another member's answer", denied(await S.c.from('form_responses').update({ answer: 'tampered' }).eq('assignment_id', aO.id).select('id')) && denied(await S.c.from('form_responses').delete().eq('assignment_id', aO.id).select('id')));
    check("cannot submit another member's form", !!(await S.c.rpc('submit_form_response', { p_assignment_id: aO.id, p_answers: [{ question_id: q1.id, answer: 'hijack' }] })).error);
    check('signed-out callers cannot submit a form', !!(await anon.rpc('submit_form_response', { p_assignment_id: aS.id, p_answers: [{ question_id: q1.id, answer: 'x' }] })).error);
    check("the other member's answer is untouched", (await admin.from('form_responses').select('answer').eq('assignment_id', aO.id).single()).data?.answer === 'private to O');

    const submit = (answers) => S.c.rpc('submit_form_response', { p_assignment_id: aS.id, p_answers: answers });
    const stillPending = async () => { const a = (await admin.from('form_assignments').select('completed_at').eq('id', aS.id).single()).data; const n = (await admin.from('form_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', aS.id)).count; return a.completed_at === null && n === 0; };
    // Without 0111 some of these succeed. When one does, put the form back so the next attempt starts clean.
    const resetS = async () => { await admin.from('form_responses').delete().eq('assignment_id', aS.id); await admin.from('form_assignments').update({ completed_at: null }).eq('id', aS.id); };
    let allRefused = true;
    const refusal = async (label, answers) => {
      const refused = !!(await submit(answers)).error;
      if (!refused) { allRefused = false; await resetS(); }
      check0111(label, refused);
    };
    await refusal('an answer to a question from a different form is refused', [{ question_id: qy.id, answer: 'x' }]);
    await refusal('more answers than the form has questions is refused', [q1, q2, q3, q4, q5, qy].map((q) => ({ question_id: q.id, answer: 'x' })));
    await refusal('text for a number question is refused', [{ question_id: q2.id, answer: 'twelve' }]);
    await refusal('a number for a text question is refused', [{ question_id: q1.id, answer: 12 }]);
    await refusal('a single text for a multi-choice question is refused', [{ question_id: q4.id, answer: 'a' }]);
    await refusal('a list with a non-text choice is refused', [{ question_id: q4.id, answer: ['a', 3] }]);
    await refusal('an answer over 8,000 characters is refused', [{ question_id: q5.id, answer: 'x'.repeat(8500) }]);
    await refusal('an empty (null) answer is refused', [{ question_id: q1.id, answer: null }]);
    check0111('none of the refused attempts stored anything or completed the form', allRefused && (await stillPending()));

    const good = await submit([
      { question_id: q1.id, answer: 'hello' },
      { question_id: q2.id, answer: 12.5 },
      { question_id: q3.id, answer: 'a' },
      { question_id: q4.id, answer: ['a', 'c'] },
    ]);
    check('control: a valid submission is accepted', !good.error, good.error?.message);
    const done = (await admin.from('form_assignments').select('completed_at').eq('id', aS.id).single()).data;
    const stored = (await admin.from('form_responses').select('id', { count: 'exact', head: true }).eq('assignment_id', aS.id)).count;
    check('the form is marked complete and all four answers are kept', !!done.completed_at && stored === 4);
    const again = await submit([{ question_id: q5.id, answer: 'late' }]);
    check('the same form cannot be submitted twice', !!again.error && /already submitted/i.test(again.error.message), again.error?.message);
    const mine = await S.c.from('form_responses').select('id').eq('assignment_id', aS.id);
    check('control: a member reads their own answers back', !mine.error && mine.data?.length === 4, mine.error?.message);

    // ================= default onboarding form =================
    console.log('  -- onboarding form');
    check('signed-out callers cannot ask for the default form', !!(await anon.rpc('assign_default_onboarding_form')).error);
    const tAssignments = async () => (await admin.from('form_assignments').select('id').eq('client_id', T.id).eq('template_id', defaultTemplate.id)).data ?? [];
    const welcomes = async () => (await admin.from('notifications').select('id').eq('client_id', T.id).like('message', 'Welcome!%')).data ?? [];
    const oDefault = async () => (await admin.from('form_assignments').select('id').eq('client_id', O.id).eq('template_id', defaultTemplate.id)).data?.length ?? 0;
    const oBefore = await oDefault();
    const offByOne = await T.c.rpc('assign_default_onboarding_form', { p_client_id: O.id });
    check('the function takes no member id (a second argument is refused)', !!offByOne.error);
    check("nobody else's form was assigned by that attempt", (await oDefault()) === oBefore);
    const coachCall = await coach.c.rpc('assign_default_onboarding_form');
    check0111('a coach calling it gets nothing assigned and no error', !coachCall.error && (await admin.from('form_assignments').select('id').eq('client_id', coach.id)).data?.length === 0, coachCall.error?.message);
    const first = await T.c.rpc('assign_default_onboarding_form');
    check0111('control: the new member gets the default onboarding form', !first.error && (await tAssignments()).length === 1, first.error?.message);
    check0111('and a welcome notification', (await welcomes()).length === 1);
    const second = await T.c.rpc('assign_default_onboarding_form');
    check0111('asking again assigns nothing more and sends no second notification', !second.error && (await tAssignments()).length === 1 && (await welcomes()).length === 1, second.error?.message);

    // ================= profile writes =================
    console.log('  -- profile');
    const row = { client_id: T.id, name: 'Test Member', gender: 'Female', start_weight: 80, goal_weight: 70, activity_level: 1.5, diet_approach: 'High Carb Low Fat', tier: 1, cycling: false };
    check("cannot create or change another member's profile row", denied(await T.c.from('client_profiles').insert({ ...row, client_id: O.id }).select('client_id')) && denied(await S.c.from('client_profiles').update({ name: 'tampered' }).eq('client_id', O.id).select('client_id')));
    const firstSave = await T.c.from('client_profiles').upsert(row).select('client_id');
    check('control: a new member saves their own first profile row', !firstSave.error && firstSave.data?.length === 1, firstSave.error?.message);
    const detail = await T.c.from('client_profiles').update({ phone: '07700 900123', goal_description: 'Lose fat', height_cm: 168 }).eq('client_id', T.id).select('client_id');
    check('control: they can update their own details', !detail.error && detail.data?.length === 1, detail.error?.message);
    check("cannot read another member's profile row", denied(await T.c.from('client_profiles').select('client_id').eq('client_id', O.id)));
    const longName = await T.c.from('client_profiles').update({ name: 'n'.repeat(101) }).eq('client_id', T.id).select('client_id');
    check0111('a name over 100 characters is refused', !!longName.error);
    check0111('a phone number over 30 characters is refused', !!(await T.c.from('client_profiles').update({ phone: '1'.repeat(31) }).eq('client_id', T.id).select('client_id')).error);
    check0111('an address over 300 characters is refused', !!(await T.c.from('client_profiles').update({ address: 'a'.repeat(301) }).eq('client_id', T.id).select('client_id')).error);
    check0111('a goal over 5,000 characters is refused', !!(await T.c.from('client_profiles').update({ goal_description: 'g'.repeat(5001) }).eq('client_id', T.id).select('client_id')).error);
    check0111('experience over 2,000 and health notes over 2,000 are refused', !!(await T.c.from('client_profiles').update({ experience: 'e'.repeat(2001) }).eq('client_id', T.id).select('client_id')).error && !!(await T.c.from('client_profiles').update({ health_notes: 'h'.repeat(2001) }).eq('client_id', T.id).select('client_id')).error);
    check0111('a height under 100 cm or over 250 cm is refused', !!(await T.c.from('client_profiles').update({ height_cm: 99 }).eq('client_id', T.id).select('client_id')).error && !!(await T.c.from('client_profiles').update({ height_cm: 251 }).eq('client_id', T.id).select('client_id')).error);
    const edge = await T.c.from('client_profiles').update({ name: 'n'.repeat(100), phone: '1'.repeat(30), goal_description: 'g'.repeat(5000), height_cm: 250 }).eq('client_id', T.id).select('client_id');
    check('control: values exactly at the limits are accepted', !edge.error && edge.data?.length === 1, edge.error?.message);

    // ================= daily check-in =================
    console.log('  -- daily check-in');
    const upsert = (client, fields, who = S) => who.c.from('daily_logs').upsert({ client_id: client, log_date: LOG_DATE, ...fields }, { onConflict: 'client_id,log_date' }).select('id');
    const first1 = await upsert(S.id, { sleep: 7, bodyweight: 70, notes: 'felt good' });
    check('control: a member saves their own day', !first1.error && first1.data?.length === 1, first1.error?.message);
    const second1 = await upsert(S.id, { steps: 9000 });
    const kept = (await admin.from('daily_logs').select('sleep, steps, bodyweight, notes').eq('client_id', S.id).eq('log_date', LOG_DATE).single()).data;
    check('control: saving one field keeps the others (steps added, sleep and weight still there)', !second1.error && kept.steps === 9000 && Number(kept.sleep) === 7 && Number(kept.bodyweight) === 70 && kept.notes === 'felt good', second1.error?.message);
    check("cannot save a day for another member", denied(await upsert(O.id, { sleep: 5 })));
    const oLogs = await S.c.from('daily_logs').select('id').eq('client_id', O.id).limit(1);
    check("another member's days are not readable", (oLogs.data ?? []).length === 0, oLogs.error?.message);
    check('scale values outside 1 to 5 are refused', !!(await upsert(S.id, { hunger: 6 })).error && !!(await upsert(S.id, { stress: 0 })).error);
    check0111('sleep over 24 hours is refused', !!(await upsert(S.id, { sleep: 25 })).error);
    check0111('steps over 100,000 is refused', !!(await upsert(S.id, { steps: 100001 })).error);
    check0111('water over 15 litres is refused', !!(await upsert(S.id, { water: 16 })).error);
    check0111('bodyweight under 20 kg or over 400 kg is refused', !!(await upsert(S.id, { bodyweight: 19 })).error && !!(await upsert(S.id, { bodyweight: 401 })).error);
    check0111('notes over 1,000 characters are refused', !!(await upsert(S.id, { notes: 'n'.repeat(1001) })).error);
    check0111('negative sleep, steps and water are refused', !!(await upsert(S.id, { sleep: -1 })).error && !!(await upsert(S.id, { steps: -1 })).error && !!(await upsert(S.id, { water: -0.5 })).error);
    const edges = await upsert(S.id, { sleep: 24, steps: 100000, water: 15, bodyweight: 400, notes: 'n'.repeat(1000) });
    check('control: figures exactly at the limits are accepted', !edges.error && edges.data?.length === 1, edges.error?.message);
    const low = await upsert(S.id, { bodyweight: 20, sleep: 0, steps: 0, water: 0 });
    check('control: the lower limits are accepted', !low.error && low.data?.length === 1, low.error?.message);
  } finally {
    // ---- put everything back ----
    await admin.from('daily_logs').delete().in('client_id', [S.id, O.id]).eq('log_date', LOG_DATE);
    await admin.from('form_templates').delete().in('id', [X.id, Y.id]);
    if (madeDefault) await admin.from('form_templates').delete().eq('id', defaultTemplate.id);
    await admin.auth.admin.deleteUser(T.id);
  }

  console.log('');
  // Once 0111 is applied, run with --expect-0111: the checks that depend on it then count as failures too.
  if (process.argv.includes('--expect-0111')) failures.push(...needs0111.map((f) => '[0111] ' + f));
  else if (needs0111.length) {
    console.log(needs0111.length + ' check(s) need migration 0111 (not applied yet, or failing):');
    needs0111.forEach((f) => console.log('  - ' + f));
  }
  console.log(failures.length + ' failure(s)');
  failures.forEach((f) => console.log('  FAIL: ' + f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('Script error:', e.message); process.exit(2); });
