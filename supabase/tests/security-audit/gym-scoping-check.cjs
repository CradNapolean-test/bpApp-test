// Gym scoping and permissions added by migrations 0129, 0130 and 0131 (fix brief 02): red flags by the member's gym (R36), the
// read-only report (RF1), objects from the wrong gym (R38), permission checks (CM3), the exercise library owner (CM4), the last
// admin (GA1), moving members and removing a coach (CH1) and what an owner can read (R37). SANDBOX ONLY: it creates and deletes
// its own test accounts (zz-scoping-*@example.com), a second gym, an organisation and test rows, and restores what it changes.
//   node supabase/tests/security-audit/gym-scoping-check.cjs --ref=<your sandbox project ref>
//
// It uses the sandbox coach (coach.sandbox@example.com) and makes everything else itself, so the sandbox members are not touched.
// The coach is temporarily given gym admin rights in the sandbox gym and a second gym, and is switched between "active gyms" with the
// service key to reproduce a coach who works in two gyms. Exit code 1 on any failure, 2 on a script error.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const TAG = 'zz-scoping';
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const nextDow = (from, target) => { let d = addDays(from, 1); while (dow(d) !== target) d = addDays(d, 1); return d; };
const mondayOnOrBefore = (iso) => addDays(iso, -((dow(iso) + 6) % 7));
const randomPassword = () => 'Zz1!' + crypto.randomBytes(9).toString('base64url');

(async () => {
  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const refused = (r, re) => !!r.error && (!re || re.test(r.error.message));
  const noEffect = (r) => !!r.error || (r.data ?? []).length === 0;
  const worked = (r) => !r.error && (r.data ?? []).length === 1;

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const signIn = async (email, password) => {
    const c = mk(anonKey);
    const s = must(await c.auth.signInWithPassword({ email, password }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const coach = await signIn('coach.sandbox@example.com', creds['coach.sandbox@example.com']);
  const G1 = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;
  const g1Row = must(await admin.from('gyms').select('id, organisation_id, name, timezone').eq('id', G1).single(), 'gym 1');
  const coachProfile0 = must(await admin.from('profiles').select('gym_id, is_gym_admin, default_checkin_reminder_days, logo_path').eq('id', coach.id).single(), 'coach profile');
  const coachCgm0 = (await admin.from('coach_gym_memberships').select('*').eq('coach_id', coach.id).eq('gym_id', G1).maybeSingle()).data;

  const created = { users: [], gyms: [], orgs: [], classes: [], templates: [], packages: [], rollouts: [], libraries: [], forms: [], runs: [], entries: [], holds: [] };
  const setActive = async (gym, isAdmin = true) => must(await admin.from('profiles').update({ gym_id: gym, is_gym_admin: isAdmin }).eq('id', coach.id), 'switch active gym');
  const mkUser = async (label, profile) => {
    const email = `${TAG}-${label}@example.com`;
    const password = randomPassword();
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw new Error('create ' + label + ': ' + made.error.message);
    created.users.push(made.data.user.id);
    must(await admin.from('profiles').insert({ id: made.data.user.id, email, ...profile }), 'profile ' + label);
    return { id: made.data.user.id, email, password };
  };

  try {
    // ---------------------------------------------------------------- fixtures
    const gym2 = must(await admin.from('gyms').insert({ name: TAG + ' gym 2' }).select('id, timezone').single(), 'gym 2');
    const gym3 = must(await admin.from('gyms').insert({ name: TAG + ' gym 3 (not in the organisation)' }).select('id').single(), 'gym 3');
    created.gyms.push(gym2.id, gym3.id);
    const org = must(await admin.from('organisations').insert({ name: TAG + ' org' }).select('id').single(), 'organisation');
    created.orgs.push(org.id);
    must(await admin.from('gyms').update({ organisation_id: org.id }).in('id', [G1, gym2.id]), 'put gyms in the organisation');

    must(await admin.from('coach_gym_memberships').upsert({ coach_id: coach.id, gym_id: G1, is_gym_admin: true }, { onConflict: 'coach_id,gym_id' }), 'coach admin of gym 1');
    must(await admin.from('coach_gym_memberships').upsert({ coach_id: coach.id, gym_id: gym2.id, is_gym_admin: true }, { onConflict: 'coach_id,gym_id' }), 'coach admin of gym 2');

    const ownerU = await mkUser('owner', { role: 'owner', organisation_id: org.id });
    const coach2U = await mkUser('coach2', { role: 'coach', gym_id: G1, is_gym_admin: false });
    must(await admin.from('coach_gym_memberships').insert([{ coach_id: coach2U.id, gym_id: G1, is_gym_admin: false }, { coach_id: coach2U.id, gym_id: gym2.id, is_gym_admin: false }]), 'coach 2 memberships');
    const c1 = await mkUser('client1', { role: 'client', coach_id: coach.id, gym_id: gym2.id });
    await mkUser('client2', { role: 'client', coach_id: coach.id, gym_id: gym2.id });
    await mkUser('client3', { role: 'client', coach_id: coach.id, gym_id: gym2.id });
    const c4 = await mkUser('client4', { role: 'client', coach_id: coach.id, gym_id: G1 }); // a member of gym 1 (the other gym)
    const owner = await signIn(ownerU.email, ownerU.password);
    const coach2 = await signIn(coach2U.email, coach2U.password);
    const member4 = await signIn(c4.email, c4.password);
    const todayLondon = new Intl.DateTimeFormat('en-CA', { timeZone: g1Row.timezone || 'UTC' }).format(new Date());

    // ---------------------------------------------------------------- R38: objects from the wrong gym
    console.log('R38: objects from the wrong gym (coach active in gym 2, member in gym 1)');
    await setActive(gym2.id);
    const formG1 = must(await admin.from('form_templates').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' form 1' }).select('id').single(), 'form 1').id;
    const formG2 = must(await admin.from('form_templates').insert({ coach_id: coach.id, gym_id: gym2.id, name: TAG + ' form 2' }).select('id').single(), 'form 2').id;
    created.forms.push(formG1, formG2);
    check("a gym-2 form is refused for a gym-1 member even though gym 2 is the coach's active gym", refused(await coach.c.rpc('assign_form', { p_template_id: formG2, p_client_id: c4.id }), /different gym/i));
    const okForm = await coach.c.rpc('assign_form', { p_template_id: formG1, p_client_id: c4.id });
    check("a gym-1 form is accepted for a gym-1 member whichever gym the coach has active", !okForm.error, okForm.error?.message);
    check('a gym-1 form is refused for a gym-2 member', refused(await coach.c.rpc('assign_form', { p_template_id: formG1, p_client_id: c1.id }), /different gym/i));

    const pkgG1 = must(await admin.from('membership_packages').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' plan 1', credits_per_week: 3 }).select('id').single(), 'plan 1').id;
    const pkgG2 = must(await admin.from('membership_packages').insert({ coach_id: coach.id, gym_id: gym2.id, name: TAG + ' plan 2', credits_per_week: 3 }).select('id').single(), 'plan 2').id;
    created.packages.push(pkgG1, pkgG2);
    check('a gym-2 plan is refused for a gym-1 member (start_membership)', refused(await coach.c.rpc('start_membership', { p_client_id: c4.id, p_package_id: pkgG2 }), /different gym/i));
    check('a gym-2 plan is refused for a gym-1 member (assign_membership)', refused(await coach.c.rpc('assign_membership', { p_client_id: c4.id, p_package_id: pkgG2 }), /different gym/i));
    check('no membership was created by those refusals', ((await admin.from('client_memberships').select('id').eq('client_id', c4.id)).data ?? []).length === 0);
    const started = await coach.c.rpc('start_membership', { p_client_id: c4.id, p_package_id: pkgG1 });
    check("a gym-1 plan is accepted for a gym-1 member while the coach's active gym is gym 2", !started.error, started.error?.message);
    const seenPlan = (await coach.c.from('membership_packages').select('id, name').eq('id', pkgG1)).data ?? [];
    check("the coach can read the name of their member's plan from the other gym", seenPlan.length === 1 && seenPlan[0].name === TAG + ' plan 1');
    const seenForm = (await coach.c.from('form_templates').select('id').eq('id', formG1)).data ?? [];
    check("the coach can read the form assigned to their member from the other gym", seenForm.length === 1);

    const program = must(await admin.from('program_templates').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' programme' }).select('id').single(), 'programme').id;
    created.templates.push(program);
    check('a gym-1 programme is refused for a gym-2 member', refused(await coach.c.rpc('instantiate_program_template', { p_template_id: program, p_client_id: c1.id, p_program_name: 'x' }), /different gym/i));

    // book_class_for_client: the four checks
    const monday = nextDow(todayLondon, 1);
    const classG1 = must(await admin.from('classes').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' class 1', capacity: 10, start_time: '06:00', day_of_week: 1 }).select('id').single(), 'class 1').id;
    const classG2 = must(await admin.from('classes').insert({ coach_id: coach.id, gym_id: gym2.id, name: TAG + ' class 2', capacity: 10, start_time: '06:00', day_of_week: 1 }).select('id').single(), 'class 2').id;
    created.classes.push(classG1, classG2);
    must(await admin.from('credits_ledger').insert({ client_id: c4.id, delta: 10, reason: TAG + ' credits', bucket: 'bonus' }), 'credits');
    const cancelledMonday = addDays(monday, 7);
    must(await admin.from('class_exceptions').insert({ class_id: classG1, occurrence_date: cancelledMonday, cancelled_by: coach.id }), 'class exception');
    const book = (cls, date) => coach.c.rpc('book_class_for_client', { p_class_id: cls, p_client_id: c4.id, p_booking_date: date });
    check("booking a gym-2 class for a gym-1 member is refused", refused(await book(classG2, monday), /different gym/i));
    check('booking a date in the past is refused', refused(await book(classG1, addDays(monday, -14)), /past/i));
    check('booking a weekday the class does not run is refused', refused(await book(classG1, nextDow(todayLondon, 2)), /doesn.{1,2}t run/i));
    check('booking a session the coach cancelled is refused', refused(await book(classG1, cancelledMonday), /cancelled/i));
    const bookedOk = await book(classG1, monday);
    check('control: a valid session can still be booked in for the member', !bookedOk.error, bookedOk.error?.message);

    // ---------------------------------------------------------------- R36 / RF1 / CL4: red flags
    console.log('R36, RF1, CL4: red flags');
    await setActive(G1);
    const oldMonday = mondayOnOrBefore(addDays(todayLondon, -210));
    const countEntries = async () => (await admin.from('red_flag_entries').select('id', { count: 'exact', head: true }).in('gym_id', [G1, gym2.id])).count;
    const before = await countEntries();
    const viewed = await coach.c.rpc('red_flag_report', { p_week_start: oldMonday });
    check('viewing a week that was never generated works and says it was not generated', !viewed.error && viewed.data && viewed.data.generated === false, viewed.error?.message);
    const stepped = [];
    for (let i = 1; i <= 4; i++) stepped.push(await coach.c.rpc('red_flag_report', { p_week_start: addDays(oldMonday, 7 * i) }));
    check('stepping back through old weeks writes no rows (RF1)', (await countEntries()) === before && stepped.every((r) => !r.error));
    check('control: the report still has its thresholds and master grid', viewed.data && viewed.data.thresholds && viewed.data.master);
    check("a coach can look at their other gym without switching (p_gym)", !(await coach.c.rpc('red_flag_report', { p_week_start: oldMonday, p_gym: gym2.id })).error);
    check('a coach cannot look at a gym they do not work at', refused(await coach.c.rpc('red_flag_report', { p_week_start: oldMonday, p_gym: gym3.id }), /not authorized/i));
    check('the owner can look at a gym in their organisation', !(await owner.c.rpc('red_flag_report', { p_week_start: oldMonday, p_gym: gym2.id })).error);
    check('the owner cannot look at a gym outside their organisation', refused(await owner.c.rpc('red_flag_report', { p_week_start: oldMonday, p_gym: gym3.id }), /not authorized/i));
    check('generate_red_flag_week is not callable by a signed-in user', !!(await coach.c.rpc('generate_red_flag_week', { p_gym: G1, p_week_start: oldMonday })).error);

    const gen = await coach.c.rpc('generate_latest_red_flag_week', { p_gym: G1 });
    check('a gym admin can generate the latest completed week', !gen.error, gen.error?.message);
    if (gen.data) {
      const entries = (await admin.from('red_flag_entries').select('client_id, gym_id').eq('week_start', gen.data.week_start).in('gym_id', [G1, gym2.id])).data ?? [];
      const wrong = [];
      for (const e of entries) {
        const g = (await admin.from('profiles').select('gym_id').eq('id', e.client_id).single()).data?.gym_id;
        if (g !== e.gym_id) wrong.push(e.client_id);
      }
      check("every entry is filed under the member's own gym", wrong.length === 0, wrong.length + ' wrong');
      check('nothing is filed under the coach\'s other gym', entries.filter((e) => e.gym_id === gym2.id).length === 0);
      check('the second request straight away is refused (rate limit)', refused(await coach.c.rpc('generate_latest_red_flag_week', { p_gym: G1 }), /moment ago/i));
      const report = await coach.c.rpc('red_flag_report', { p_week_start: gen.data.week_start });
      check('that week now reads as generated', !report.error && report.data.generated === true);
    }
    check('a coach who is not an admin cannot generate', refused(await coach2.c.rpc('generate_latest_red_flag_week', { p_gym: G1 }), /gym admin/i));

    const entry = must(await admin.from('red_flag_entries').insert({ gym_id: G1, week_start: oldMonday, client_id: c4.id, attended: 0, low_attendance: true, coach_id: coach.id }).select('id').single(), 'entry').id;
    created.entries.push(entry);
    created.runs.push({ gym_id: G1, week_start: oldMonday });
    check('a coach can record contact on an entry', worked(await coach.c.from('red_flag_entries').update({ contacted: 'yes' }).eq('id', entry).select('id')));
    check('...and name a coach who works at the gym', worked(await coach.c.from('red_flag_entries').update({ coach_id: coach2.id }).eq('id', entry).select('id')));
    check('...but not someone who does not (CL4)', refused(await coach.c.from('red_flag_entries').update({ coach_id: owner.id }).eq('id', entry).select('id'), /does not work/i));
    check("an entry's member cannot be changed", refused(await coach.c.from('red_flag_entries').update({ client_id: c1.id }).eq('id', entry).select('id'), /cannot be changed/i));
    check('an entry cannot be created for a member of another gym', refused(await coach.c.from('red_flag_entries').insert({ gym_id: G1, week_start: addDays(oldMonday, 7), client_id: c1.id }).select('id'), /different gym/i));

    const hold = (from, to) => coach.c.from('membership_holds').insert({ client_id: c4.id, started_on: from, ended_on: to }).select('id');
    const h1 = await hold(todayLondon, addDays(todayLondon, 6));
    check('a hold can be started', !h1.error, h1.error?.message);
    if (h1.data?.[0]) created.holds.push(h1.data[0].id);
    check('an overlapping hold is refused (CL4)', refused(await hold(addDays(todayLondon, 3), addDays(todayLondon, 10)), /overlaps/i));
    check('an open-ended hold overlapping the first is refused', refused(await hold(addDays(todayLondon, 5), null), /overlaps/i));
    const h2 = await hold(addDays(todayLondon, 7), addDays(todayLondon, 14));
    check('a hold that starts after the first ends is accepted', !h2.error, h2.error?.message);
    if (h2.data?.[0]) created.holds.push(h2.data[0].id);

    // ---------------------------------------------------------------- CM6: dates by gym calendar
    console.log('CM6: dates by the gym\'s calendar');
    const nz = await coach.c.rpc('local_date', { p_tz: 'Pacific/Auckland', p_at: '2026-10-14T22:30:00Z' });
    const uk = await coach.c.rpc('local_date', { p_tz: 'Europe/London', p_at: '2026-10-14T22:30:00Z' });
    check('22:30 UTC on the 14th is already the 15th in Auckland', nz.data === '2026-10-15', String(nz.data));
    check('...but still the 14th in London', uk.data === '2026-10-14', String(uk.data));
    must(await admin.from('gyms').update({ timezone: 'Pacific/Auckland' }).eq('id', gym2.id), 'gym 2 to Auckland');
    const stats = await owner.c.rpc('owner_gym_stats');
    check('the owner statistics still run with a gym on Pacific/Auckland', !stats.error && Array.isArray(stats.data), stats.error?.message);
    check('...and the activity report', !(await owner.c.rpc('owner_activity_report', { p_gym: gym2.id, p_weeks: 4, p_tz: 'Europe/London' })).error);
    check('...and the overview', !(await owner.c.rpc('owner_gyms_overview')).error);

    // ---------------------------------------------------------------- CM3 + GA1: permission checks
    console.log('CM3: permission checks');
    await setActive(G1);
    check('cancelling a session that has already happened is refused', refused(await coach.c.rpc('cancel_class_occurrence', { p_class_id: classG1, p_date: addDays(todayLondon, -7), p_reason: 'x' }), /already happened/i));
    check('a blank gym name is refused', refused(await coach.c.rpc('set_gym_name', { p_name: '   ' })));
    check('a gym name over 80 characters is refused', refused(await coach.c.rpc('set_gym_name', { p_name: 'x'.repeat(81) }), /80/));
    check('61 reminder days is refused', refused(await coach.c.rpc('set_default_checkin_reminder_days', { p_days: 61 })));
    check('60 reminder days is accepted', !(await coach.c.rpc('set_default_checkin_reminder_days', { p_days: 60 })).error);
    check("a logo path in someone else's folder is refused", refused(await coach.c.rpc('set_logo_path', { p_path: `${coach2.id}/logo.png` })));
    check('a path with sub-folders is refused', refused(await coach.c.rpc('set_logo_path', { p_path: `${coach.id}/a/b.png` })));
    check('a path in their own folder is accepted', !(await coach.c.rpc('set_logo_path', { p_path: `${coach.id}/logo-1.png` })).error);
    check('clearing the logo is accepted', !(await coach.c.rpc('set_logo_path', { p_path: null })).error);

    const rollout = must(await admin.from('programme_rollouts').insert({ gym_id: G1, template_id: program, program_name: TAG + ' rollout', start_date: todayLondon, audience: 'selected', client_ids: [c4.id] }).select('id').single(), 'rollout').id;
    created.rollouts.push(rollout);
    check('a member cannot apply a rollout (null-safe check)', refused(await member4.c.rpc('apply_programme_rollout', { p_rollout_id: rollout }), /not authorized/i));
    check('...and it stayed unapplied', ((await admin.from('programme_rollouts').select('applied_at').eq('id', rollout).single()).data?.applied_at ?? null) === null);

    console.log('CM4: exercise library');
    const mine = must(await admin.from('exercise_library').insert({ name: TAG + ' mine', created_by: coach.id }).select('id').single(), 'library entry').id;
    const seeded = must(await admin.from('exercise_library').insert({ name: TAG + ' seeded', created_by: null }).select('id').single(), 'seeded library entry').id;
    created.libraries.push(mine, seeded);
    check('the author can edit their entry', worked(await coach.c.from('exercise_library').update({ notes: 'edited' }).eq('id', mine).select('id')));
    check('another coach cannot edit it', noEffect(await coach2.c.from('exercise_library').update({ notes: 'hacked' }).eq('id', mine).select('id')));
    check('another coach cannot delete it', noEffect(await coach2.c.from('exercise_library').delete().eq('id', mine).select('id')));
    check('the author cannot hand it to someone else', refused(await coach.c.from('exercise_library').update({ created_by: coach2.id }).eq('id', mine).select('id')));
    check('the author can retire it (is_active)', worked(await coach.c.from('exercise_library').update({ is_active: false }).eq('id', mine).select('id')));
    check('a gym admin can edit a seeded entry', worked(await coach.c.from('exercise_library').update({ notes: 'admin edit' }).eq('id', seeded).select('id')));
    check('a coach who is not an admin cannot', noEffect(await coach2.c.from('exercise_library').update({ notes: 'no' }).eq('id', seeded).select('id')));
    check('a member cannot', noEffect(await member4.c.from('exercise_library').update({ notes: 'no' }).eq('id', seeded).select('id')));
    check('a coach can still add an entry as themselves', !(await coach2.c.from('exercise_library').insert({ name: TAG + ' coach2', created_by: coach2.id }).select('id')).error);
    check('...but not as someone else', refused(await coach2.c.from('exercise_library').insert({ name: TAG + ' forged', created_by: coach.id }).select('id')));

    console.log('GA1: the last admin');
    must(await admin.from('coach_gym_memberships').update({ is_gym_admin: true }).eq('coach_id', coach2.id).eq('gym_id', gym2.id), 'coach 2 admin');
    await setActive(gym2.id);
    check('an admin can demote another admin while one remains', !(await coach.c.rpc('set_gym_admin', { p_coach_id: coach2.id, p_is_admin: false })).error);
    check('...but cannot demote the last admin (themselves)', refused(await coach.c.rpc('set_gym_admin', { p_coach_id: coach.id, p_is_admin: false }), /at least one admin/i));
    check('...nor can the owner', refused(await owner.c.rpc('owner_set_gym_admin', { p_gym: gym2.id, p_coach: coach.id, p_is_admin: false }), /at least one admin/i));
    check('someone who does not work at the gym is refused', refused(await coach.c.rpc('set_gym_admin', { p_coach_id: owner.id, p_is_admin: true }), /does not work/i));
    must(await admin.from('coach_gym_memberships').update({ is_gym_admin: true }).eq('coach_id', coach2.id).eq('gym_id', gym2.id), 'coach 2 admin again');
    must(await admin.from('profiles').update({ gym_id: gym2.id, is_gym_admin: true }).eq('id', coach2.id), 'coach 2 active in gym 2');
    const race = await Promise.all([
      coach.c.rpc('set_gym_admin', { p_coach_id: coach2.id, p_is_admin: false }),
      coach2.c.rpc('set_gym_admin', { p_coach_id: coach.id, p_is_admin: false }),
    ]);
    const admins = (await admin.from('coach_gym_memberships').select('coach_id').eq('gym_id', gym2.id).eq('is_gym_admin', true)).data ?? [];
    check('two admins demoting each other at once leave at least one admin', admins.length >= 1, admins.length + ' left');
    check('...and exactly one of the two requests succeeded', race.filter((r) => !r.error).length === 1, race.map((r) => (r.error ? 'refused' : 'ok')).join(' / '));
    must(await admin.from('coach_gym_memberships').update({ is_gym_admin: true }).eq('coach_id', coach.id).eq('gym_id', gym2.id), 'coach admin restored');

    // ---------------------------------------------------------------- CH1: moving members, removing a coach
    console.log('CH1: moving members and removing a coach');
    await setActive(gym2.id);
    must(await admin.from('coach_gym_memberships').update({ is_gym_admin: false }).eq('coach_id', coach2.id).eq('gym_id', gym2.id), 'coach 2 not admin');
    const journal = must(await admin.from('client_journal_entries').insert({ client_id: c1.id, coach_id: coach.id, kind: 'injury', body: TAG + ' injury note' }).select('id').single(), 'journal entry').id;
    const isCoachOf = async (c, id) => (await c.c.rpc('is_coach_of', { target_client_id: id })).data;
    check('before: the first coach coaches the member, the second does not', (await isCoachOf(coach, c1.id)) === true && (await isCoachOf(coach2, c1.id)) === false);
    check('a coach who is not a gym admin cannot reassign', refused(await coach2.c.rpc('reassign_clients', { p_gym: gym2.id, p_from: coach.id, p_to: coach2.id }), /not authorized/i));
    check('moving to the same coach is refused', refused(await coach.c.rpc('reassign_clients', { p_gym: gym2.id, p_from: coach.id, p_to: coach.id }), /different coaches/i));
    check('moving to someone who does not work at the gym is refused', refused(await coach.c.rpc('reassign_clients', { p_gym: gym2.id, p_from: coach.id, p_to: owner.id }), /work at this gym/i));
    const moved = await coach.c.rpc('reassign_clients', { p_gym: gym2.id, p_from: coach.id, p_to: coach2.id });
    check('an admin moves the three gym-2 members to the other coach', !moved.error && moved.data === 3, moved.error?.message ?? String(moved.data));
    check('after: the old coach no longer coaches them and the new coach does', (await isCoachOf(coach, c1.id)) === false && (await isCoachOf(coach2, c1.id)) === true);
    check("...and the gym-1 member of the old coach was not moved", (await admin.from('profiles').select('coach_id').eq('id', c4.id).single()).data?.coach_id === coach.id);
    check('the new coach can read the old coach\'s journal entry', ((await coach2.c.from('client_journal_entries').select('id').eq('id', journal)).data ?? []).length === 1);
    check('...but cannot edit or delete it (only the author can)', noEffect(await coach2.c.from('client_journal_entries').update({ body: 'changed' }).eq('id', journal).select('id')) && noEffect(await coach2.c.from('client_journal_entries').delete().eq('id', journal).select('id')));
    check('the author can still edit it', worked(await coach.c.from('client_journal_entries').update({ body: TAG + ' edited' }).eq('id', journal).select('id')));
    check('removing a coach who still has members is refused', refused(await coach.c.rpc('remove_coach_from_gym', { p_gym: gym2.id, p_coach: coach2.id }), /still has/i));
    check('moving the members back works for the owner too', (await owner.c.rpc('owner_reassign_clients', { p_gym: gym2.id, p_from: coach2.id, p_to: coach.id })).data === 3);
    const removed = await coach.c.rpc('remove_coach_from_gym', { p_gym: gym2.id, p_coach: coach2.id });
    check('a coach with no members can be removed from the gym', !removed.error && removed.data && removed.data.removed === true, removed.error?.message);
    check('...and still has a gym, so is not deactivated', removed.data && removed.data.deactivated === false);
    check('removing the last admin is refused', refused(await coach.c.rpc('remove_coach_from_gym', { p_gym: gym2.id, p_coach: coach.id }), /at least one admin|still has/i));
    const removedAll = await owner.c.rpc('owner_remove_coach_from_gym', { p_gym: G1, p_coach: coach2.id });
    check('the owner removes a coach from their last gym: they are flagged as deactivated', !removedAll.error && removedAll.data && removedAll.data.deactivated === true, removedAll.error?.message);
    const c2Profile = (await admin.from('profiles').select('gym_id, deactivated_at').eq('id', coach2.id).single()).data;
    check('...with no active gym and a deactivation time', c2Profile && c2Profile.gym_id === null && !!c2Profile.deactivated_at);
    check('adding a client account as a coach is refused', refused(await owner.c.rpc('owner_add_coach_to_gym', { p_gym: gym2.id, p_coach: c1.id, p_is_admin: false }), /not a coach/i));
    check('the owner can add the coach back, and they get an active gym again', !(await owner.c.rpc('owner_add_coach_to_gym', { p_gym: G1, p_coach: coach2.id, p_is_admin: false })).error && (await admin.from('profiles').select('gym_id').eq('id', coach2.id).single()).data?.gym_id === G1);

    // ---------------------------------------------------------------- R37: what an owner can read and do
    console.log('R37: the owner');
    for (const table of ['client_profiles', 'daily_logs', 'food_diary_entries', 'manual_macro_entries', 'food_photo_entries', 'form_assignments', 'form_responses', 'client_coach_notes', 'client_journal_entries', 'chat_messages', 'progress_photos', 'workout_logs', 'bookings', 'credits_ledger', 'client_memberships', 'notifications', 'habits']) {
      const r = await owner.c.from(table).select('*', { count: 'exact', head: true });
      check(`the owner reads no rows of ${table}`, (!r.error && r.count === 0) || !!r.error, r.error ? 'error: ' + r.error.message : String(r.count));
    }
    const roster = await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id });
    check('the owner roster lists the gym members', !roster.error && roster.data.total === 3 && roster.data.members.length === 3, roster.error?.message);
    const keys = roster.data ? Object.keys(roster.data.members[0] ?? {}) : [];
    check('...with no health fields', !keys.some((k) => /weight|fat|health|injur|note|photo|macro|calorie/i.test(k)), keys.join(','));
    check('the "no plan" filter lists them', (await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id, p_filter: 'no_plan' })).data?.total === 3);
    check('the "on plan" filter lists none', (await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id, p_filter: 'on_plan' })).data?.total === 0);
    check('search finds one member', (await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id, p_search: 'client1' })).data?.total === 1);
    check('paging works', (await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id, p_limit: 2, p_offset: 2 })).data?.members?.length === 1);
    check('an unknown filter is refused', refused(await owner.c.rpc('owner_gym_roster', { p_gym: gym2.id, p_filter: 'everything' })));
    check('the roster of a gym outside the organisation is refused', refused(await owner.c.rpc('owner_gym_roster', { p_gym: gym3.id }), /not authorized/i));
    check('a coach cannot use the owner roster', refused(await coach.c.rpc('owner_gym_roster', { p_gym: gym2.id }), /not authorized/i));
    check('the owner can rename a gym in their organisation', !(await owner.c.rpc('owner_rename_gym', { p_gym: gym2.id, p_name: TAG + ' renamed' })).error && (await admin.from('gyms').select('name').eq('id', gym2.id).single()).data?.name === TAG + ' renamed');
    check('...not one outside it', refused(await owner.c.rpc('owner_rename_gym', { p_gym: gym3.id, p_name: 'nope' }), /not authorized/i));
    check('...and not as a coach', refused(await coach.c.rpc('owner_rename_gym', { p_gym: gym2.id, p_name: 'nope' }), /not authorized/i));
    check('the owner can set booking rules', !(await owner.c.rpc('owner_set_gym_booking_settings', { p_gym: gym2.id, p_timezone: 'Europe/London', p_blackout_start: '23:00', p_blackout_end: '05:00' })).error);
    check('a made-up timezone is refused', !!(await owner.c.rpc('owner_set_gym_booking_settings', { p_gym: gym2.id, p_timezone: 'Mars/Olympus', p_blackout_start: null, p_blackout_end: null })).error);
    check('only one blackout time is refused', refused(await owner.c.rpc('owner_set_gym_booking_settings', { p_gym: gym2.id, p_timezone: 'Europe/London', p_blackout_start: '23:00', p_blackout_end: null }), /both/i));
    check('the owner cannot call the gym admin functions', refused(await owner.c.rpc('set_gym_name', { p_name: 'nope' }), /not authorized/i));
    check('the internal functions are not callable by anyone signed in', !!(await coach.c.rpc('_set_gym_admin', { p_gym: gym2.id, p_coach: coach.id, p_is_admin: true })).error && !!(await owner.c.rpc('_rename_gym', { p_gym: gym2.id, p_name: 'nope' })).error);
  } finally {
    // Clean-up, in dependency order. The service key bypasses every rule.
    await admin.from('client_journal_entries').delete().like('body', TAG + '%');
    if (created.holds.length) await admin.from('membership_holds').delete().in('id', created.holds);
    if (created.entries.length) await admin.from('red_flag_entries').delete().in('id', created.entries);
    for (const gymId of [G1, ...created.gyms]) await admin.from('red_flag_entries').delete().eq('gym_id', gymId).in('client_id', created.users);
    for (const r of created.runs) await admin.from('red_flag_week_runs').delete().eq('gym_id', r.gym_id).eq('week_start', r.week_start);
    if (created.classes.length) {
      await admin.from('bookings').delete().in('class_id', created.classes);
      await admin.from('class_exceptions').delete().in('class_id', created.classes);
      await admin.from('classes').delete().in('id', created.classes);
    }
    if (created.rollouts.length) await admin.from('programme_rollouts').delete().in('id', created.rollouts);
    if (created.templates.length) await admin.from('program_templates').delete().in('id', created.templates);
    if (created.forms.length) {
      await admin.from('form_assignments').delete().in('template_id', created.forms);
      await admin.from('form_templates').delete().in('id', created.forms);
    }
    if (created.packages.length) {
      await admin.from('client_memberships').delete().in('package_id', created.packages);
      await admin.from('membership_packages').delete().in('id', created.packages);
    }
    if (created.libraries.length) await admin.from('exercise_library').delete().in('id', created.libraries);
    await admin.from('exercise_library').delete().like('name', TAG + '%');
    for (const id of created.users) {
      await admin.from('credits_ledger').delete().eq('client_id', id);
      await admin.auth.admin.deleteUser(id);
    }
    await admin.from('coach_gym_memberships').delete().eq('coach_id', coach.id).eq('gym_id', created.gyms[0] ?? '00000000-0000-0000-0000-000000000000');
    await admin.from('gyms').update({ organisation_id: g1Row.organisation_id ?? null }).eq('id', G1);
    if (created.gyms.length) await admin.from('gyms').delete().in('id', created.gyms);
    if (created.orgs.length) await admin.from('organisations').delete().in('id', created.orgs);
    if (coachCgm0) await admin.from('coach_gym_memberships').upsert(coachCgm0, { onConflict: 'coach_id,gym_id' });
    await admin.from('profiles').update({
      gym_id: coachProfile0.gym_id, is_gym_admin: coachProfile0.is_gym_admin,
      default_checkin_reminder_days: coachProfile0.default_checkin_reminder_days, logo_path: coachProfile0.logo_path,
    }).eq('id', coach.id);
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
