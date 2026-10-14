// Booking rules, enforced by the database (book_class), not the app. SANDBOX ONLY: creates and deletes test rows.
//   node supabase/tests/security-audit/booking-rules-check.cjs --ref=<your sandbox project ref>
//
// A member must be able to book a real, upcoming, uncancelled session at their own gym, be charged for it, be
// waitlisted when it is full (no charge) and be refused a second booking of the same session. They must NOT be able
// to book: a past date, a weekday the class does not run, a coach-cancelled session, or another gym's class.
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
const mk = (k) => createClient(url, k, { auth: { persistSession: false } });
const admin = mk(process.env.SUPABASE_SERVICE_ROLE_KEY);
const creds = Object.fromEntries(fs.readFileSync(root + '/sandbox-credentials.local.txt', 'utf8').split(/\r?\n/).filter((l) => l.includes(' / ')).map((l) => l.split(' / ')));
const must = (r, w) => { if (r.error) throw new Error(w + ': ' + r.error.message); return r.data; };
const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const dow = (iso) => new Date(iso + 'T00:00:00Z').getUTCDay();
const nextDow = (from, target) => { let d = addDays(from, 1); while (dow(d) !== target) d = addDays(d, 1); return d; };

(async () => {
  const A = mk(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const sa = must(await A.auth.signInWithPassword({ email: 'member.a.sandbox@example.com', password: creds['member.a.sandbox@example.com'] }), 'login A');
  const aId = sa.user.id;
  const bId = must(await admin.from('profiles').select('id').eq('email', 'member.b.sandbox@example.com').single(), 'B').id;
  const coach = must(await admin.from('profiles').select('id, gym_id').eq('email', 'coach.sandbox@example.com').single(), 'coach');
  const gymTz = must(await admin.from('gyms').select('timezone').eq('id', coach.gym_id).single(), 'gym').timezone;
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: gymTz }).format(new Date());

  const failures = [];
  const created = { classes: [], gyms: [] };
  // The ledger is append-only, so the test cannot delete what it spends; it remembers where the balance started and, at the
  // end, appends one correcting row that puts it back (the service role cannot cancel_booking to refund, since 0105).
  const ledgerBalance = async () => ((await admin.from('credits_ledger').select('delta').eq('client_id', aId)).data ?? []).reduce((s, r) => s + r.delta, 0);
  const startBalance = await ledgerBalance();
  must(await admin.from('credits_ledger').insert({ client_id: aId, delta: 20, reason: 'booking-rules test credits', bucket: 'bonus' }), 'grant');

  const otherGym = must(await admin.from('gyms').insert({ name: 'booking-rules other gym' }).select('id').single(), 'gym2').id;
  created.gyms.push(otherGym);
  const mkClass = async (fields) => {
    const id = must(await admin.from('classes').insert({ coach_id: coach.id, gym_id: coach.gym_id, name: 'rules-class', capacity: 10, start_time: '06:00', ...fields }).select('id').single(), 'class').id;
    created.classes.push(id);
    return id;
  };
  const weekly = await mkClass({ day_of_week: 1 });
  const nextMonday = nextDow(today, 1);
  const cancelledMonday = addDays(nextMonday, 7);
  must(await admin.from('class_exceptions').insert({ class_id: weekly, occurrence_date: cancelledMonday, cancelled_by: coach.id }), 'exception');
  const oneOffDate = addDays(today, 5);
  const oneOff = await mkClass({ day_of_week: null, specific_date: oneOffDate });
  const foreign = await mkClass({ day_of_week: 1, gym_id: otherGym });
  const tiny = await mkClass({ day_of_week: 2, capacity: 1 });
  const tuesday = nextDow(today, 2);

  const expect = async (label, classId, date, shouldWork) => {
    const r = await A.rpc('book_class', { p_class_id: classId, p_booking_date: date });
    const worked = !r.error;
    if (worked !== shouldWork) failures.push(label + (worked ? ' (it was ACCEPTED)' : ' (it was REJECTED: ' + r.error.message + ')'));
    else console.log('  ok:', label);
    return r;
  };
  const balance = async () => must(await A.from('credits_balance').select('balance').eq('client_id', aId).maybeSingle(), 'balance')?.balance ?? 0;

  // Controls: legitimate bookings work and are charged.
  const before = await balance();
  const good = await expect('books a real upcoming session at their own gym', weekly, nextMonday, true);
  const after = await balance();
  if (before - after !== 1) failures.push(`booking was not charged exactly 1 credit (before ${before}, after ${after})`);
  else console.log('  ok: booking charged exactly 1 credit');
  await expect('refuses a second booking of the same session', weekly, nextMonday, false);
  await expect('books a one-off session on its own date', oneOff, oneOffDate, true);
  const todayClass = await mkClass({ day_of_week: dow(today) });
  await expect("books a session on the gym's current day (same day is allowed)", todayClass, today, true);

  // Denials.
  await expect('refuses a date in the past', weekly, addDays(nextMonday, -14), false);
  await expect('refuses yesterday', weekly, addDays(today, -1), false);
  await expect('refuses a weekday the class does not run', weekly, tuesday, false);
  await expect('refuses a session the coach cancelled', weekly, cancelledMonday, false);
  await expect('refuses a one-off session on a different date', oneOff, addDays(oneOffDate, 7), false);
  await expect("refuses another gym's class", foreign, nextMonday, false);

  // Waitlist: a full session waitlists the member and charges nothing.
  must(await admin.from('bookings').insert({ class_id: tiny, client_id: bId, booking_date: tuesday, status: 'booked' }), 'fill tiny');
  const b0 = await balance();
  const wl = await expect('waitlists a member on a full session', tiny, tuesday, true);
  if (wl.data && wl.data.status !== 'waitlist') failures.push('full session did not waitlist (status ' + wl.data.status + ')');
  if ((await balance()) !== b0) failures.push('waitlisting charged a credit');
  else console.log('  ok: waitlisting costs nothing');

  // Cleanup. The test's bookings and classes are removed, then one correcting ledger row returns the balance to where it
  // started (whatever the test granted or spent).
  await admin.from('bookings').delete().in('class_id', created.classes);
  await admin.from('class_exceptions').delete().in('class_id', created.classes);
  await admin.from('classes').delete().in('id', created.classes);
  await admin.from('gyms').delete().in('id', created.gyms);
  const correction = startBalance - (await ledgerBalance());
  if (correction !== 0) await admin.from('credits_ledger').insert({ client_id: aId, delta: correction, reason: 'booking-rules test cleanup (restores the starting balance)', bucket: 'bonus' });

  console.log(`\n${failures.length} failure(s)`);
  failures.forEach((f) => console.log('  FAIL:', f));
  process.exit(failures.length ? 1 : 0);
})().catch((e) => { console.error('ERROR:', e.message); process.exit(2); });
