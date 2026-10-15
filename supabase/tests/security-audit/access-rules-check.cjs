// Access rules added by migration 0127 (fix brief 01): the exercise library (H1), the member profile plan and review fields
// (M10), the timezone defaults (M9) and the education / internal functions (CL2). The bookings rule (H2) is checked at the end
// of booking-rules-check.cjs. SANDBOX ONLY: creates and deletes test rows, and restores member B's client_profiles row.
//   node supabase/tests/security-audit/access-rules-check.cjs --ref=<your sandbox project ref>
//
// Checked as real sandbox accounts (member A, member B, the sandbox coach) and as a logged-out caller:
//  - H1: a member cannot add, edit, take over or delete library entries and can still read them; a coach can still manage entries.
//  - M10: a member cannot clear the review flag, remove review notes, change goal / setting / diet approach after onboarding,
//    re-open onboarding or change the reminder days; a member CAN still save their own details, add review notes, request and
//    cancel account deletion, and re-send an unchanged whole form. While onboarding is still open the plan can be set. The
//    coach can change all of it.
//  - M9: a new gym and a new member profile default to Europe/London.
//  - CL2: a logged-out caller cannot call the education functions; a signed-in member still reaches them.
// Exit code 1 on any failure, 2 on a script error.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const ZERO = '00000000-0000-0000-0000-000000000000';
const LIB = 'zz-access-rules-check';

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

  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const noEffect = (r) => !!r.error || (r.data ?? []).length === 0; // refused outright, or matched no row
  const refused = (r) => !!r.error;
  const worked = (r) => !r.error && (r.data ?? []).length === 1;

  const coachGym = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;
  const bProfile0 = (await admin.from('client_profiles').select('*').eq('client_id', B.id).maybeSingle()).data;
  const bIsCoached = must(await admin.from('profiles').select('coach_id').eq('id', B.id).single(), 'B coach').coach_id === coach.id;
  const tempUsers = [];
  const tempGyms = [];

  try {
    // ---------------------------------------------------------------- H1: exercise library
    console.log('H1: exercise library');
    const libId = must(await admin.from('exercise_library').insert({ name: LIB, created_by: coach.id }).select('id').single(), 'seed library entry').id;

    check('a member cannot add a library entry', noEffect(await A.c.from('exercise_library').insert({ name: LIB + ' member', created_by: A.id }).select('id')));
    check('a member cannot edit a library entry', noEffect(await A.c.from('exercise_library').update({ name: LIB + ' hacked' }).eq('id', libId).select('id')));
    check('a member cannot take over a library entry', noEffect(await A.c.from('exercise_library').update({ created_by: A.id }).eq('id', libId).select('id')));
    check('a member cannot delete a library entry', noEffect(await A.c.from('exercise_library').delete().eq('id', libId).select('id')));
    check('logged out cannot add a library entry', noEffect(await anon.from('exercise_library').insert({ name: LIB + ' anon' }).select('id')));
    const after = (await admin.from('exercise_library').select('name, created_by').eq('id', libId).maybeSingle()).data;
    check('the entry is unchanged by those attempts', !!after && after.name === LIB && after.created_by === coach.id);
    const stray = (await admin.from('exercise_library').select('id').like('name', LIB + ' %')).data ?? [];
    check('no stray entry was created by a member', stray.length === 0, stray.length + ' found');
    check('control: a member can still read the library', ((await A.c.from('exercise_library').select('id').eq('id', libId)).data ?? []).length === 1);

    const coachRow = await coach.c.from('exercise_library').insert({ name: LIB + ' coach', created_by: coach.id }).select('id').single();
    check('control: a coach can add a library entry', !coachRow.error, coachRow.error?.message);
    if (coachRow.data) {
      check('control: a coach can edit their own entry', worked(await coach.c.from('exercise_library').update({ notes: 'edited' }).eq('id', coachRow.data.id).select('id')));
      check('control: a coach can delete their own entry', worked(await coach.c.from('exercise_library').delete().eq('id', coachRow.data.id).select('id')));
    }

    // ---------------------------------------------------------------- M10: member profile fields
    console.log('M10: plan and review fields on a member profile');
    const seed = {
      client_id: B.id, name: 'Member B (access check)', start_weight: 80, goal_weight: 75,
      onboarding_completed_at: new Date().toISOString(), needs_coach_review: true, review_reasons: ['access-check reason'],
      nutrition_goal: 'fat_loss', nutrition_setting: 'steady', diet_approach: 'High Carb Low Fat', deletion_requested_at: null,
    };
    must(await admin.from('client_profiles').upsert(seed, { onConflict: 'client_id' }), 'seed member B profile');
    const reset = async (patch = {}) => must(await admin.from('client_profiles').update({ ...seed, ...patch }).eq('client_id', B.id), 'reset member B profile');
    const upd = (c, patch) => c.from('client_profiles').update(patch).eq('client_id', B.id).select('client_id');
    const reminder = must(await admin.from('client_profiles').select('checkin_reminder_days').eq('client_id', B.id).single(), 'reminder').checkin_reminder_days;

    // Onboarding finished: the plan and review fields are the coach's.
    check('member cannot clear the review flag', refused(await upd(B.c, { needs_coach_review: false })));
    check('member cannot empty the review notes', refused(await upd(B.c, { review_reasons: [] })));
    check('member cannot swap the review notes for others', refused(await upd(B.c, { review_reasons: ['something else'] })));
    check('member cannot change their goal', refused(await upd(B.c, { nutrition_goal: 'muscle_gain' })));
    check('member cannot change their setting', refused(await upd(B.c, { nutrition_setting: 'aggressive' })));
    check('member cannot change their diet approach', refused(await upd(B.c, { diet_approach: 'Higher Fat' })));
    check('member cannot re-open onboarding', refused(await upd(B.c, { onboarding_completed_at: null })));
    check('member cannot change their reminder days', refused(await upd(B.c, { checkin_reminder_days: (reminder ?? 3) + 1 })));
    const unchanged = must(await admin.from('client_profiles').select('needs_coach_review, review_reasons, nutrition_goal, nutrition_setting, diet_approach, onboarding_completed_at').eq('client_id', B.id).single(), 'after refusals');
    check('those refused changes left the row as it was', unchanged.needs_coach_review === true && unchanged.review_reasons.length === 1 && unchanged.nutrition_goal === 'fat_loss' && unchanged.nutrition_setting === 'steady' && unchanged.diet_approach === 'High Carb Low Fat' && !!unchanged.onboarding_completed_at);

    // What a member must still be able to do.
    check('control: member can save their own details', worked(await upd(B.c, { name: 'Member B (access check) renamed', phone: '07000000000', goal_weight: 74 })));
    check('control: member can add a review note (an InBody scan does this)', worked(await upd(B.c, { review_reasons: ['access-check reason', 'Body fat updated from an InBody scan: check their targets'], needs_coach_review: true, body_fat_pct: 22, body_fat_estimated: false })));
    check('control: member can request account deletion', worked(await upd(B.c, { deletion_requested_at: new Date().toISOString() })));
    check('control: member can cancel the deletion request', worked(await upd(B.c, { deletion_requested_at: null })));
    await reset();
    check('control: re-sending an unchanged whole form works (the Setup save)', worked(await upd(B.c, {
      name: seed.name, nutrition_goal: seed.nutrition_goal, nutrition_setting: seed.nutrition_setting, diet_approach: seed.diet_approach,
      needs_coach_review: true, review_reasons: seed.review_reasons, onboarding_completed_at: seed.onboarding_completed_at, updated_at: new Date().toISOString(),
    })));

    // Onboarding still open: the first save sets the plan.
    await reset({ onboarding_completed_at: null });
    check('onboarding open: member can set their plan', worked(await upd(B.c, { nutrition_goal: 'muscle_gain', nutrition_setting: 'moderate', diet_approach: 'Higher Fat' })));
    check('onboarding open: member can replace the review notes while the flag stays raised', worked(await upd(B.c, { review_reasons: ['starting plan: check targets'], needs_coach_review: true })));
    check('onboarding open: member still cannot clear the review flag', refused(await upd(B.c, { needs_coach_review: false })));
    check('onboarding open: member can finish onboarding', worked(await upd(B.c, { onboarding_completed_at: new Date().toISOString() })));
    check('onboarding finished: the plan is locked again', refused(await upd(B.c, { nutrition_goal: 'fat_loss' })));

    if (bIsCoached) {
      await reset();
      check('control: the coach can change the plan', worked(await upd(coach.c, { nutrition_goal: 'muscle_gain', nutrition_setting: 'moderate' })));
      check('control: the coach can clear the review flag', worked(await upd(coach.c, { needs_coach_review: false, review_reasons: [] })));
      check('control: the coach can ask for a details update', worked(await upd(coach.c, { onboarding_completed_at: null })));
    } else {
      console.log('  (member B is not assigned to the sandbox coach: coach controls skipped)');
    }

    // ---------------------------------------------------------------- M9: timezone defaults
    console.log('M9: timezone defaults');
    const gym = must(await admin.from('gyms').insert({ name: 'access-rules timezone check' }).select('id, timezone').single(), 'new gym');
    tempGyms.push(gym.id);
    check('a new gym defaults to Europe/London', gym.timezone === 'Europe/London', gym.timezone);

    const tmpEmail = 'tz-default-check@example.com';
    const made = await admin.auth.admin.createUser({ email: tmpEmail, password: 'Zz-' + Math.random().toString(36).slice(2) + 'Aa1!', email_confirm: true });
    if (made.error) throw new Error('create timezone-check user: ' + made.error.message);
    tempUsers.push(made.data.user.id);
    must(await admin.from('profiles').insert({ id: made.data.user.id, role: 'client', email: tmpEmail, coach_id: coach.id, gym_id: coachGym }), 'timezone-check profile');
    const cp = must(await admin.from('client_profiles').insert({ client_id: made.data.user.id, name: 'Timezone check', start_weight: 70, goal_weight: 65 }).select('timezone').single(), 'timezone-check client profile');
    check('a new member profile defaults to Europe/London', cp.timezone === 'Europe/London', cp.timezone);

    // ---------------------------------------------------------------- CL2: functions
    console.log('CL2: functions');
    const denied = (r) => !!r.error && (r.error.code === '42501' || /permission denied/i.test(r.error.message));
    check('logged out cannot call assign_education_content', denied(await anon.rpc('assign_education_content', { p_content_id: ZERO, p_client_id: ZERO })));
    check('logged out cannot call mark_education_complete', denied(await anon.rpc('mark_education_complete', { p_assignment_id: ZERO })));
    check('logged out cannot call the profile e-mail sync trigger function', !!(await anon.rpc('sync_profile_email')).error);
    const ctl = await A.c.rpc('mark_education_complete', { p_assignment_id: ZERO });
    check('control: a signed-in member still reaches mark_education_complete (no permission error; it just matches no assignment)', !denied(ctl), ctl.error?.message);
  } finally {
    await admin.from('exercise_library').delete().like('name', LIB + '%');
    if (bProfile0) await admin.from('client_profiles').upsert(bProfile0, { onConflict: 'client_id' });
    else await admin.from('client_profiles').delete().eq('client_id', B.id);
    for (const id of tempUsers) await admin.auth.admin.deleteUser(id);
    if (tempGyms.length) await admin.from('gyms').delete().in('id', tempGyms);
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
