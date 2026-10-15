// Credits, bookings and integrity rules added by migrations 0132, 0133 and (optionally) 0143 (fix brief 03): refunds capped at the
// weekly allowance (CH4), retiring a session (CH2), editing booked sessions (R26), attendance dates (SV1), the check-in window (L6),
// credit grants and removals (CM9), programme rollouts (R5), template imports (CL3) and deleting a broadcast group (R33).
// SANDBOX ONLY: it creates and deletes its own test accounts (zz-credits-*@example.com), classes, a plan, a pack, templates, a group
// and broadcasts, and restores what it changes on the sandbox coach. It also runs send_due_communications once (as the service key),
// which sends any broadcast that happens to be due in the sandbox.
//   node supabase/tests/security-audit/credits-integrity-check.cjs --ref=<your sandbox project ref> [--after-0143]
//
// With --after-0143 it also checks that a coach can no longer insert into credits_ledger directly (apply 0143 only after brief 05 is
// merged); without the flag that check is listed as pending. Exit code 1 on any failure, 2 on a script error.
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
const after0143 = process.argv.includes('--after-0143');
const mk = (k) => createClient(url, k, { auth: { persistSession: false, autoRefreshToken: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const TAG = 'zz-credits';
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const nextDow = (from, target) => { let d = addDays(from, 1); while (dow(d) !== target) d = addDays(d, 1); return d; };
const randomPassword = () => 'Zz1!' + crypto.randomBytes(9).toString('base64url');
const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

(async () => {
  const failures = [];
  const check = (label, pass, detail) => { if (pass) console.log('  ok:', label); else failures.push(label + (detail ? ' (' + detail + ')' : '')); };
  const refused = (r, re) => !!r.error && (!re || re.test(r.error.message));

  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const signIn = async (email, password) => {
    const c = mk(anonKey);
    const s = must(await c.auth.signInWithPassword({ email, password }), 'login ' + email);
    return { c, id: s.user.id };
  };
  const coach = await signIn('coach.sandbox@example.com', creds['coach.sandbox@example.com']);
  const G1 = must(await admin.from('profiles').select('gym_id').eq('id', coach.id).single(), 'coach gym').gym_id;
  const gym = must(await admin.from('gyms').select('timezone').eq('id', G1).single(), 'gym');
  const tz = gym.timezone || 'UTC';
  const coachProfile0 = must(await admin.from('profiles').select('gym_id, is_gym_admin').eq('id', coach.id).single(), 'coach profile');
  const coachCgm0 = (await admin.from('coach_gym_memberships').select('*').eq('coach_id', coach.id).eq('gym_id', G1).maybeSingle()).data;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  const monday = nextDow(today, 1);

  const created = { users: [], classes: [], packages: [], packs: [], templates: [], rollouts: [], groups: [], comms: [] };
  const mkUser = async (label, profile) => {
    const email = `${TAG}-${label}@example.com`;
    const password = randomPassword();
    const made = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (made.error) throw new Error('create ' + label + ': ' + made.error.message);
    created.users.push(made.data.user.id);
    must(await admin.from('profiles').insert({ id: made.data.user.id, email, ...profile }), 'profile ' + label);
    return { id: made.data.user.id, email, password };
  };
  const member = (label) => mkUser(label, { role: 'client', coach_id: coach.id, gym_id: G1 });
  const ledger = (id, bucket, delta, reason) => admin.from('credits_ledger').insert({ client_id: id, delta, bucket, reason: reason ?? TAG + ' setup' });
  const balances = async (id) => {
    const rows = must(await admin.from('credits_ledger').select('bucket, delta').eq('client_id', id), 'balances');
    const out = { membership: 0, bonus: 0 };
    for (const r of rows) out[r.bucket] += r.delta;
    return out;
  };
  const mkClass = async (fields) => {
    const id = must(await admin.from('classes').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' class', capacity: 10, start_time: '06:00', day_of_week: 1, ...fields }).select('id').single(), 'class').id;
    created.classes.push(id);
    return id;
  };

  try {
    // ---------------------------------------------------------------- fixtures
    must(await admin.from('coach_gym_memberships').upsert({ coach_id: coach.id, gym_id: G1, is_gym_admin: true }, { onConflict: 'coach_id,gym_id' }), 'coach admin');
    must(await admin.from('profiles').update({ gym_id: G1, is_gym_admin: true }).eq('id', coach.id), 'coach active gym');
    const pkg = must(await admin.from('membership_packages').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' plan', credits_per_week: 3 }).select('id').single(), 'plan').id;
    created.packages.push(pkg);

    // ---------------------------------------------------------------- CH4: refunds are capped at the weekly allowance
    console.log('CH4: refunds and the weekly allowance');
    const m1u = await member('m1');
    must(await admin.from('client_memberships').insert({ client_id: m1u.id, package_id: pkg }), 'm1 membership');
    must(await ledger(m1u.id, 'membership', 3, 'membership reset: setup'), 'm1 credits');
    const m1 = await signIn(m1u.email, m1u.password);
    const cls = await mkClass({});
    const booked = await m1.c.rpc('book_class', { p_class_id: cls, p_booking_date: addDays(monday, 7) });
    check('the member books next week\'s session (3 to 2)', !booked.error && (await balances(m1u.id)).membership === 2, booked.error?.message);
    must(await ledger(m1u.id, 'membership', 1, 'membership reset: Monday'), 'simulate the Monday reset'); // back to 3
    const cancelled = await m1.c.rpc('cancel_booking', { p_booking_id: booked.data.id });
    check('cancelling before the cut-off works', !cancelled.error, cancelled.error?.message);
    check('...and the member ends at 3, not 4 (the refund was capped)', (await balances(m1u.id)).membership === 3, JSON.stringify(await balances(m1u.id)));
    const marker = must(await admin.from('credits_ledger').select('delta, reason').eq('booking_id', booked.data.id).gte('delta', 0), 'zero row');
    check('...with a zero row on the booking so it is not mistaken for a late cancel', marker.length === 1 && marker[0].delta === 0, JSON.stringify(marker));

    const m2u = await member('m2');
    must(await admin.from('client_memberships').insert({ client_id: m2u.id, package_id: pkg }), 'm2 membership');
    must(await ledger(m2u.id, 'membership', 3, 'membership reset: setup'), 'm2 credits');
    const m2 = await signIn(m2u.email, m2u.password);
    const b1 = await m2.c.rpc('book_class', { p_class_id: cls, p_booking_date: addDays(monday, 7) });
    const b2 = await m2.c.rpc('book_class', { p_class_id: cls, p_booking_date: addDays(monday, 14) });
    check('a member who has booked two sessions is at 1', !b1.error && !b2.error && (await balances(m2u.id)).membership === 1);
    await m2.c.rpc('cancel_booking', { p_booking_id: b1.data.id });
    check('a refund to a member below their allowance is full (1 to 2)', (await balances(m2u.id)).membership === 2);
    await m2.c.rpc('cancel_booking', { p_booking_id: b2.data.id });
    check('...and again up to the allowance (2 to 3)', (await balances(m2u.id)).membership === 3);

    const m3u = await member('m3');
    must(await ledger(m3u.id, 'bonus', 5, 'bonus setup'), 'm3 credits');
    const m3 = await signIn(m3u.email, m3u.password);
    const bb = await m3.c.rpc('book_class', { p_class_id: cls, p_booking_date: addDays(monday, 7) });
    await m3.c.rpc('cancel_booking', { p_booking_id: bb.data.id });
    check('bonus credits are refunded in full', !bb.error && (await balances(m3u.id)).bonus === 5, JSON.stringify(await balances(m3u.id)));

    // ---------------------------------------------------------------- CH2: retire, never delete
    console.log('CH2: retiring a session');
    const r = [await member('r1'), await member('r2'), await member('r3')];
    for (const u of r) must(await ledger(u.id, 'bonus', 5, 'bonus setup'), 'retire credits');
    const rs = [];
    for (const u of r) rs.push(await signIn(u.email, u.password));
    const cls2 = await mkClass({ name: TAG + ' retire me' });
    for (const s of rs) must(await s.c.rpc('book_class', { p_class_id: cls2, p_booking_date: addDays(monday, 7) }), 'book to retire');
    const pastDate = addDays(monday, -14);
    must(await admin.from('bookings').insert({ class_id: cls2, client_id: r[0].id, booking_date: pastDate, status: 'booked', attended: true }), 'past booking');
    const spentBefore = (await balances(r[0].id)).bonus;
    check('before retiring, the member has paid a credit for the booking (5 to 4)', spentBefore === 4, String(spentBefore));
    check('deleting a session that has bookings is refused', refused(await coach.c.from('classes').delete().eq('id', cls2).select('id'), /retire/i));
    const retired = await coach.c.rpc('retire_class', { p_class_id: cls2 });
    check('retiring cancels the three future bookings and refunds three credits', !retired.error && retired.data && retired.data.cancelled === 3 && retired.data.refunded_credits === 3, JSON.stringify(retired.data ?? retired.error?.message));
    const afterRetire = await Promise.all(r.map((u) => balances(u.id)));
    check('every member has their credit back', afterRetire.every((b) => b.bonus === 5), JSON.stringify(afterRetire));
    const notes = (await admin.from('notifications').select('client_id').in('client_id', r.map((u) => u.id)).like('message', 'Class cancelled:%')).data ?? [];
    check('...and one notification each', notes.length === 3, String(notes.length));
    const past = (await admin.from('bookings').select('status, attended').eq('class_id', cls2).eq('booking_date', pastDate)).data ?? [];
    check('the past booking and its attendance are untouched', past.length === 1 && past[0].status === 'booked' && past[0].attended === true);
    check('retiring again is harmless', (await coach.c.rpc('retire_class', { p_class_id: cls2 })).data?.already_retired === true);
    check('a retired session cannot be booked', refused(await rs[0].c.rpc('book_class', { p_class_id: cls2, p_booking_date: addDays(monday, 14) }), /no longer running/i));
    check('a retired session cannot be booked by the coach either', refused(await coach.c.rpc('book_class_for_client', { p_class_id: cls2, p_client_id: r[0].id, p_booking_date: addDays(monday, 14) }), /no longer running/i));
    check('a member cannot retire a session', refused(await m1.c.rpc('retire_class', { p_class_id: cls }), /not authorized/i));
    const empty = await mkClass({ name: TAG + ' mistake' });
    created.classes.pop();
    check('a session with no bookings at all can still be deleted', !(await coach.c.from('classes').delete().eq('id', empty)).error);

    // ---------------------------------------------------------------- R26: editing a booked session
    console.log('R26: editing a booked session');
    const cls3 = await mkClass({ name: TAG + ' edit me', capacity: 2 });
    for (const s of rs.slice(0, 2)) must(await s.c.rpc('book_class', { p_class_id: cls3, p_booking_date: addDays(monday, 7) }), 'book to edit');
    check('lowering the capacity below the number booked is refused', refused(await coach.c.from('classes').update({ capacity: 1 }).eq('id', cls3).select('id'), /already booked/i));
    check('raising it is fine', !(await coach.c.from('classes').update({ capacity: 5 }).eq('id', cls3).select('id')).error);
    check('changing the weekday while members are booked is refused', refused(await coach.c.from('classes').update({ day_of_week: 2 }).eq('id', cls3).select('id'), /retire this slot/i));
    check('moving the start time works', !(await coach.c.from('classes').update({ start_time: '07:00' }).eq('id', cls3).select('id')).error);
    const timeNotes = (await admin.from('notifications').select('client_id').in('client_id', [r[0].id, r[1].id]).like('message', 'Class time changed:%')).data ?? [];
    check('...and tells the two booked members', timeNotes.length === 2, String(timeNotes.length));

    // ---------------------------------------------------------------- SV1: attendance dates
    console.log('SV1: attendance dates');
    const futureBooking = (await admin.from('bookings').select('id').eq('class_id', cls3).eq('client_id', r[0].id).eq('booking_date', addDays(monday, 7)).single()).data.id;
    check('marking a future session as attended is refused', refused(await coach.c.rpc('mark_attendance_status', { p_booking_id: futureBooking, p_status: 'attended' }), /hasn.{1,2}t happened/i));
    check('...and with mark_attendance', refused(await coach.c.rpc('mark_attendance', { p_booking_id: futureBooking, p_attended: true }), /hasn.{1,2}t happened/i));
    check('clearing a mark is still allowed', !(await coach.c.rpc('mark_attendance_status', { p_booking_id: futureBooking, p_status: 'unmarked' })).error);
    const pastBooking = must(await admin.from('bookings').insert({ class_id: cls3, client_id: r[1].id, booking_date: addDays(monday, -7), status: 'booked' }).select('id').single(), 'past booking 2').id;
    check('control: a past session can be marked', !(await coach.c.rpc('mark_attendance_status', { p_booking_id: pastBooking, p_status: 'attended' })).error);

    // ---------------------------------------------------------------- L6: the check-in window
    console.log('L6: the check-in window');
    const nowLocal = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date()).split(':').map(Number);
    const nowMin = nowLocal[0] * 60 + nowLocal[1];
    if (nowMin < 200 || nowMin > 1440 - 200) {
      console.log('  (skipped: too close to midnight at the gym to build classes 3 hours either side of now)');
    } else {
      const todayDow = dow(today);
      const early = await mkClass({ name: TAG + ' early', day_of_week: todayDow, start_time: hhmm(nowMin + 180) });
      const late = await mkClass({ name: TAG + ' late', day_of_week: todayDow, start_time: hhmm(nowMin - 180) });
      const open = await mkClass({ name: TAG + ' open', day_of_week: todayDow, start_time: hhmm(nowMin + 10) });
      for (const c of [early, late, open]) must(await admin.from('bookings').insert({ class_id: c, client_id: r[2].id, booking_date: today, status: 'booked' }), 'today booking');
      check('check-in more than 30 minutes before the class is refused', refused(await rs[2].c.rpc('check_in_booking', { p_class_id: early, p_booking_date: today }), /opens 30 minutes/i));
      check('check-in more than 60 minutes after the start is refused', refused(await rs[2].c.rpc('check_in_booking', { p_class_id: late, p_booking_date: today }), /has closed/i));
      check('check-in 10 minutes before the class works', !(await rs[2].c.rpc('check_in_booking', { p_class_id: open, p_booking_date: today })).error);
    }

    // ---------------------------------------------------------------- CM9: grants and removals
    console.log('CM9: credit grants and removals');
    const g = await member('grant');
    check('a grant of 51 is refused', refused(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 51, p_reason: 'too many' }), /between 1 and 50/i));
    check('a grant of 0 is refused', refused(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 0, p_reason: 'none' })));
    check('a grant with no reason is refused', refused(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 5, p_reason: '  ' }), /reason/i));
    check('a reason over 200 characters is refused', refused(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 5, p_reason: 'x'.repeat(201) })));
    check('an expiry in the past is refused', refused(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 5, p_reason: 'old', p_expires_at: '2020-01-01T00:00:00Z' })));
    check('a member cannot grant themselves credits', refused(await m3.c.rpc('grant_credits', { p_client: m3u.id, p_amount: 5, p_reason: 'me' }), /not authorized/i));
    check('a grant of 5 works and is a bonus credit by the coach', !(await coach.c.rpc('grant_credits', { p_client: g.id, p_amount: 5, p_reason: TAG + ' grant' })).error && (await balances(g.id)).bonus === 5);
    const row = (await admin.from('credits_ledger').select('granted_by, bucket').eq('client_id', g.id).eq('reason', TAG + ' grant').single()).data;
    check('...recorded against the coach', row && row.granted_by === coach.id && row.bucket === 'bonus');
    check('removing 51 is refused', refused(await coach.c.rpc('remove_credits', { p_client: g.id, p_amount: 51, p_reason: 'x' })));
    const race = await Promise.all([
      coach.c.rpc('remove_credits', { p_client: g.id, p_amount: 4, p_reason: 'extra session' }),
      coach.c.rpc('remove_credits', { p_client: g.id, p_amount: 4, p_reason: 'extra session' }),
    ]);
    const after = await balances(g.id);
    check('two removals of 4 from 5 credits at once: exactly one succeeds', race.filter((x) => !x.error).length === 1, race.map((x) => (x.error ? 'refused' : 'ok')).join(' / '));
    check('...and the balance never goes below zero', after.bonus === 1 && after.membership >= 0, JSON.stringify(after));
    const pack = must(await admin.from('credit_packs').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' pack', credits: 7, expires_after_days: 30 }).select('id').single(), 'pack').id;
    created.packs.push(pack);
    check('a credit pack is granted from the pack\'s own row', !(await coach.c.rpc('grant_credit_pack', { p_client: g.id, p_pack: pack })).error && (await balances(g.id)).bonus === 8);
    const packRow = (await admin.from('credits_ledger').select('expires_at, pack_id').eq('client_id', g.id).eq('pack_id', pack).single()).data;
    check('...with its expiry and pack id', packRow && !!packRow.expires_at);
    if (after0143) {
      check('(0143) a coach can no longer insert into the ledger directly', refused(await coach.c.from('credits_ledger').insert({ client_id: g.id, delta: 99, reason: 'direct', granted_by: coach.id })));
    } else {
      console.log('  (pending: the direct-insert check runs with --after-0143)');
    }

    // ---------------------------------------------------------------- R5: programme rollouts
    console.log('R5: starting a programme');
    const coach2U = await mkUser('coach2', { role: 'coach', gym_id: G1, is_gym_admin: false });
    must(await admin.from('coach_gym_memberships').insert({ coach_id: coach2U.id, gym_id: G1, is_gym_admin: false }), 'coach 2 membership');
    const coach2 = await signIn(coach2U.email, coach2U.password);
    const template = must(await admin.from('program_templates').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' template' }).select('id').single(), 'template').id;
    created.templates.push(template);
    const rolloutCount = async () => (await admin.from('programme_rollouts').select('id', { count: 'exact', head: true }).eq('template_id', template)).count;
    check('a coach who is not an admin cannot start a programme for everyone', refused(await coach2.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: 'x', p_start: today, p_audience: 'all', p_client_ids: [], p_starts_now: false }), /gym admin/i));
    check('...and cannot pick members who are not theirs', refused(await coach2.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: 'x', p_start: today, p_audience: 'selected', p_client_ids: [r[0].id], p_starts_now: false }), /your own members/i));
    const other = await mkUser('other-gym', { role: 'client', coach_id: coach.id, gym_id: null });
    check('a member with no gym is refused', refused(await coach.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: 'x', p_start: today, p_audience: 'selected', p_client_ids: [other.id], p_starts_now: false }), /different gym/i));
    check('a start date years away is refused', refused(await coach.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: 'x', p_start: addDays(today, 800), p_audience: 'selected', p_client_ids: [r[0].id], p_starts_now: false }), /start date/i));
    check('none of those refusals left a rollout behind', (await rolloutCount()) === 0, String(await rolloutCount()));
    const started = await coach.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: TAG + ' programme', p_start: today, p_audience: 'selected', p_client_ids: [r[0].id], p_starts_now: true });
    check('starting a programme now for one member reports 1', !started.error && started.data === 1, started.error?.message);
    const prog = (await admin.from('workout_programs').select('id').eq('client_id', r[0].id).eq('name', TAG + ' programme')).data ?? [];
    check('...and the member has it', prog.length === 1);
    const later = await coach.c.rpc('schedule_programme_rollout', { p_template_id: template, p_program_name: TAG + ' later', p_start: addDays(today, 10), p_audience: 'all', p_client_ids: [], p_starts_now: false });
    check('scheduling for the whole gym reports how many members it will reach', !later.error && later.data >= 1, later.error?.message);
    const laterRows = (await admin.from('programme_rollouts').select('id').eq('template_id', template).eq('program_name', TAG + ' later')).data ?? [];
    for (const row2 of laterRows) await admin.from('programme_rollouts').delete().eq('id', row2.id); // never leave an "everyone" rollout for the overnight job

    // ---------------------------------------------------------------- CL3: template import
    console.log('CL3: template import');
    const templateCount = async () => (await admin.from('program_templates').select('id', { count: 'exact', head: true }).eq('coach_id', coach.id)).count;
    const ex = (name, extra = {}) => ({ name, sets: 3, reps: '8-10', section: 'lift', ...extra });
    const goodFile = { version: 1, name: TAG + ' imported', days: [
      { week_num: 1, day_label: 'Day 1', sort_order: 0, exercises: [ex('Back squat', { video_url: 'http://insecure.example.com/v', bogus_field: 'ignored' }), ex('Bench press')] },
      { week_num: 2, day_label: 'Day 1', sort_order: 0, exercises: [ex('Deadlift')] },
    ] };
    const beforeCount = await templateCount();
    const imported = await coach.c.rpc('import_program_template', { p_json: goodFile });
    check('a valid file imports in one go and answers the new template\'s id', !imported.error && typeof imported.data === 'string', imported.error?.message);
    if (imported.data) {
      created.templates.push(imported.data);
      const days = (await admin.from('program_template_days').select('id').eq('template_id', imported.data)).data ?? [];
      const exs = (await admin.from('program_template_exercises').select('name, video_url').in('template_day_id', days.map((d) => d.id))).data ?? [];
      check('...with both days and all three exercises', days.length === 2 && exs.length === 3, `${days.length} days, ${exs.length} exercises`);
      check('...and an insecure video link left empty', exs.find((e) => e.name === 'Back squat')?.video_url === null);
    }
    const tooMany = { version: 1, name: TAG + ' too many', days: [{ week_num: 1, day_label: 'Day 1', exercises: Array.from({ length: 61 }, (_, i) => ex('Exercise ' + i)) }] };
    check('a day with 61 exercises is refused', refused(await coach.c.rpc('import_program_template', { p_json: tooMany }), /60 exercises/i));
    const tooLong = { version: 1, name: TAG + ' 21 weeks', days: Array.from({ length: 21 }, (_, i) => ({ week_num: i + 1, day_label: 'Day 1', exercises: [] })) };
    check('21 weeks are refused', refused(await coach.c.rpc('import_program_template', { p_json: tooLong }), /20 weeks/i));
    const percent = { version: 1, name: TAG + ' percent', days: [{ week_num: 1, day_label: 'Day 1', exercises: [ex('Zz unknown lift', { prescription_type: 'percent_1rm', percent_1rm: 80 })] }] };
    check('a % of 1RM exercise with no library entry is refused by name', refused(await coach.c.rpc('import_program_template', { p_json: percent }), /Zz unknown lift/));
    check('something that is not a template file is refused', refused(await coach.c.rpc('import_program_template', { p_json: { hello: 'world' } }), /recognised/i) && refused(await coach.c.rpc('import_program_template', { p_json: [1, 2] }), /recognised/i));
    check('none of the refused imports left a half-built template', (await templateCount()) === beforeCount + 1, `${beforeCount} before, ${await templateCount()} after`);
    check('a member cannot import', refused(await m1.c.rpc('import_program_template', { p_json: goodFile }), /only a coach/i));

    // ---------------------------------------------------------------- R33: deleting a group
    console.log('R33: deleting a broadcast group');
    const group = must(await admin.from('client_groups').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' morning crew' }).select('id').single(), 'group').id;
    created.groups.push(group);
    const comm = (fields) => admin.from('scheduled_communications').insert({ coach_id: coach.id, gym_id: G1, message: TAG + ' message', target_type: 'group', target_group_id: group, channel: 'message', ...fields }).select('id').single();
    const sent = must(await comm({ send_at: new Date(Date.now() - 3600e3).toISOString(), sent_at: new Date().toISOString() }), 'sent broadcast').id;
    const pending = must(await comm({ send_at: new Date(Date.now() + 7 * 86400e3).toISOString(), repeat: 'weekly' }), 'pending broadcast').id;
    created.comms.push(sent, pending);
    check('a new group broadcast got the group\'s name saved', (await admin.from('scheduled_communications').select('target_group_name').eq('id', sent).single()).data?.target_group_name === TAG + ' morning crew');
    check('a new group broadcast with no group is refused', refused(await admin.from('scheduled_communications').insert({ coach_id: coach.id, gym_id: G1, message: 'x', target_type: 'group', send_at: new Date().toISOString(), channel: 'message' }), /choose a group/i));
    const deleted = await coach.c.from('client_groups').delete().eq('id', group).select('id');
    check('deleting a group that has a sent broadcast now works', !deleted.error && (deleted.data ?? []).length === 1, deleted.error?.message);
    const sentRow = (await admin.from('scheduled_communications').select('target_group_id, target_group_name, cancelled_at, sent_at').eq('id', sent).single()).data;
    check('...the sent broadcast stays in the history with the group\'s name', sentRow && sentRow.target_group_id === null && sentRow.target_group_name === TAG + ' morning crew' && !sentRow.cancelled_at && !!sentRow.sent_at);
    const pendingRow = (await admin.from('scheduled_communications').select('cancelled_at, sent_at').eq('id', pending).single()).data;
    check('...and the pending repeating one was cancelled', pendingRow && !!pendingRow.cancelled_at && !pendingRow.sent_at);
    // The sender's own safety net: a due group broadcast whose group has gone is cancelled, never sent.
    const group2 = must(await admin.from('client_groups').insert({ coach_id: coach.id, gym_id: G1, name: TAG + ' second group' }).select('id').single(), 'group 2').id;
    created.groups.push(group2);
    const orphan = must(await admin.from('scheduled_communications').insert({ coach_id: coach.id, gym_id: G1, message: TAG + ' orphan message', target_type: 'group', target_group_id: group2, send_at: new Date(Date.now() - 60e3).toISOString(), channel: 'message' }).select('id').single(), 'orphan').id;
    created.comms.push(orphan);
    must(await admin.from('scheduled_communications').update({ target_group_id: null }).eq('id', orphan), 'orphan the broadcast');
    must(await admin.rpc('send_due_communications'), 'run the sender');
    const orphanRow = (await admin.from('scheduled_communications').select('cancelled_at, sent_at').eq('id', orphan).single()).data;
    const stray = (await admin.from('chat_messages').select('id').like('text', TAG + ' orphan%')).data ?? [];
    check('the sender cancels it and sends it to nobody', orphanRow && !!orphanRow.cancelled_at && !orphanRow.sent_at && stray.length === 0, `cancelled=${orphanRow?.cancelled_at}, sent messages=${stray.length}`);
  } finally {
    // Clean-up, in dependency order. The service key bypasses every rule.
    await admin.from('chat_messages').delete().like('text', TAG + '%');
    if (created.comms.length) await admin.from('scheduled_communications').delete().in('id', created.comms);
    await admin.from('scheduled_communications').delete().like('message', TAG + '%');
    if (created.groups.length) await admin.from('client_groups').delete().in('id', created.groups);
    await admin.from('programme_rollouts').delete().like('program_name', TAG + '%');
    await admin.from('workout_programs').delete().like('name', TAG + '%');
    if (created.templates.length) await admin.from('program_templates').delete().in('id', created.templates);
    await admin.from('program_templates').delete().like('name', TAG + '%');
    if (created.classes.length) {
      await admin.from('bookings').delete().in('class_id', created.classes);
      await admin.from('class_exceptions').delete().in('class_id', created.classes);
    }
    await admin.from('classes').delete().like('name', TAG + '%'); // includes the retired one (no bookings left)
    if (created.packs.length) await admin.from('credit_packs').delete().in('id', created.packs);
    if (created.packages.length) {
      await admin.from('client_memberships').delete().in('package_id', created.packages);
      await admin.from('membership_packages').delete().in('id', created.packages);
    }
    for (const id of created.users) {
      await admin.from('credits_ledger').delete().eq('client_id', id);
      await admin.from('notifications').delete().eq('client_id', id);
      await admin.auth.admin.deleteUser(id);
    }
    if (coachCgm0) await admin.from('coach_gym_memberships').upsert(coachCgm0, { onConflict: 'coach_id,gym_id' });
    await admin.from('profiles').update({ gym_id: coachProfile0.gym_id, is_gym_admin: coachProfile0.is_gym_admin }).eq('id', coach.id);
  }

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
