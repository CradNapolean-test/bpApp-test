import { config } from 'dotenv';
config({ path: '.env.local' });

import { randomBytes } from 'node:crypto';
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '../lib/supabase/admin';

// Creates 100 dummy client accounts + a handful of classes with varied capacity, then
// exercises the real book_class/cancel_booking RPCs (signed in as each dummy client, not
// the admin client bypassing RLS) to stress-test capacity limits, waitlisting, cancellation
// refunds, and waitlist auto-promotion under realistic load. Persistent test data --
// intentionally not cleaned up afterward so it can be reviewed in the app.

const COACH_ID = 'e7dbeca2-ecce-4f81-97cb-8b540fa75392'; // basfitnz@gmail.com
const NUM_CLIENTS = 100;

function toIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + n);
  return c;
}
function nextDateForWeekday(dow: number, from: Date): string {
  const diff = (dow - from.getUTCDay() + 7) % 7;
  return toIso(addDays(from, diff));
}

const FIRST_NAMES = [
  'Olivia', 'Liam', 'Emma', 'Noah', 'Ava', 'Ethan', 'Sophia', 'Mason', 'Isabella', 'Lucas',
  'Mia', 'Logan', 'Amelia', 'Jack', 'Harper', 'Aiden', 'Evelyn', 'Elijah', 'Abigail', 'Grayson',
];
const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez',
  'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore', 'Jackson', 'Martin', 'Lee',
  'Perez', 'White',
];

interface DummyClient {
  id: string;
  email: string;
  password: string;
  name: string;
}

async function signedInClient(email: string, password: string) {
  const client = createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign-in failed for ${email}: ${error.message}`);
  return client;
}

async function main() {
  const admin = createAdminClient();
  const today = new Date();

  console.log(`=== Phase 1: Creating ${NUM_CLIENTS} dummy clients ===`);
  const clients: DummyClient[] = [];

  for (let i = 0; i < NUM_CLIENTS; i++) {
    const email = `stress-test-${String(i + 1).padStart(3, '0')}@example.com`;
    const password = 'Stress' + randomBytes(6).toString('base64url') + '1!';
    const name = `${FIRST_NAMES[i % FIRST_NAMES.length]} ${LAST_NAMES[Math.floor(i / FIRST_NAMES.length) % LAST_NAMES.length]}`;

    const { data: userData, error: userErr } = await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (userErr) {
      console.error(`  FAILED to create ${email}: ${userErr.message}`);
      continue;
    }
    const clientId = userData.user.id;

    const { error: profileErr } = await admin.from('profiles').insert({
      id: clientId, role: 'client', coach_id: COACH_ID, email,
    });
    if (profileErr) {
      console.error(`  FAILED profile insert for ${email}: ${profileErr.message}`);
      continue;
    }

    const startWeight = Math.round(60 + Math.random() * 40);
    const goalWeight = startWeight - (3 + Math.floor(Math.random() * 15));
    await admin.from('client_profiles').insert({
      client_id: clientId,
      name,
      start_weight: startWeight,
      goal_weight: goalWeight,
      activity_level: Math.round((1.3 + Math.random() * 0.5) * 10) / 10,
      diet_approach: Math.random() > 0.5 ? 'High Carb Low Fat' : 'Higher Fat',
      tier: 1 + Math.floor(Math.random() * 3),
      cycling: Math.random() > 0.7,
      checkin_reminder_days: 3,
    });

    // Spread across Program Health buckets: ~50% recent (green), 25% ~5 days (amber),
    // 25% ~8-22 days (red) -- so the widget has a realistic mix to look at, not just 100
    // identical "green" rows.
    const bucket = Math.random();
    const daysAgo = bucket < 0.5 ? Math.floor(Math.random() * 3)
      : bucket < 0.75 ? 4 + Math.floor(Math.random() * 3)
      : 8 + Math.floor(Math.random() * 15);
    await admin.from('daily_logs').insert({
      client_id: clientId,
      log_date: toIso(addDays(today, -daysAgo)),
      protein: Math.round(100 + Math.random() * 80),
      carbs: Math.round(120 + Math.random() * 100),
      fat: Math.round(50 + Math.random() * 40),
      bodyweight: startWeight - Math.round(Math.random() * 3 * 10) / 10,
      steps: Math.round(5000 + Math.random() * 8000),
    });

    const grant = 2 + Math.floor(Math.random() * 4);
    await admin.from('credits_ledger').insert({
      client_id: clientId, delta: grant, reason: 'manual grant', granted_by: COACH_ID,
    });

    clients.push({ id: clientId, email, password, name });
    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${NUM_CLIENTS}`);
  }
  console.log(`Created ${clients.length}/${NUM_CLIENTS} clients.\n`);

  console.log('=== Phase 2: Creating classes ===');
  const classDefs = [
    { name: 'Small Group PT', day_of_week: 2, start_time: '07:00', capacity: 3, cutoff_hours: 12 },
    { name: 'Sunrise HIIT', day_of_week: 1, start_time: '06:00', capacity: 10, cutoff_hours: 12 },
    { name: 'Yoga Flow', day_of_week: 3, start_time: '18:00', capacity: 15, cutoff_hours: 6 },
    { name: 'Strength Circuit', day_of_week: 4, start_time: '17:30', capacity: 8, cutoff_hours: 12 },
    { name: 'Evening Bootcamp', day_of_week: 5, start_time: '18:30', capacity: 5, cutoff_hours: 24 },
  ];
  const classIds: Record<string, string> = {};
  for (const c of classDefs) {
    const { data, error } = await admin.from('classes').insert({ ...c, coach_id: COACH_ID }).select('id').single();
    if (error) throw error;
    classIds[c.name] = data.id;
    console.log(`  "${c.name}" — capacity ${c.capacity}, cutoff ${c.cutoff_hours}h`);
  }
  console.log('');

  console.log('=== Phase 3: Waitlist test — 8 clients book "Small Group PT" (capacity 3) ===');
  const testDate = toIso(addDays(today, 14)); // far enough out that cancel-refund cutoff is never an issue
  const testers = clients.slice(0, 8);
  const bookingResults: { email: string; status: string; id: string }[] = [];

  for (const c of testers) {
    try {
      const client = await signedInClient(c.email, c.password);
      const { data, error } = await client.rpc('book_class', {
        p_class_id: classIds['Small Group PT'], p_booking_date: testDate,
      });
      if (error) throw error;
      bookingResults.push({ email: c.email, status: data.status, id: data.id });
      await client.auth.signOut();
    } catch (e) {
      console.error(`  booking failed for ${c.email}:`, e instanceof Error ? e.message : e);
    }
  }
  console.table(bookingResults.map((r) => ({ email: r.email, status: r.status })));
  const bookedCount = bookingResults.filter((r) => r.status === 'booked').length;
  const waitlistCount = bookingResults.filter((r) => r.status === 'waitlist').length;
  console.log(`Booked: ${bookedCount} (expect 3) · Waitlisted: ${waitlistCount} (expect ${testers.length - 3})\n`);

  console.log('=== Phase 4: Cancel 2 booked spots, confirm waitlist auto-promotion + refunds ===');
  const toCancel = bookingResults.filter((r) => r.status === 'booked').slice(0, 2);
  for (const r of toCancel) {
    const c = testers.find((t) => t.email === r.email)!;
    try {
      const client = await signedInClient(c.email, c.password);
      const { error } = await client.rpc('cancel_booking', { p_booking_id: r.id });
      if (error) throw error;
      console.log(`  cancelled ${c.email}`);
      await client.auth.signOut();
    } catch (e) {
      console.error(`  cancel failed for ${c.email}:`, e instanceof Error ? e.message : e);
    }
  }

  const { data: finalBookings } = await admin
    .from('bookings')
    .select('client_id, status')
    .eq('class_id', classIds['Small Group PT'])
    .eq('booking_date', testDate);
  const testerIdSet = new Map(testers.map((t) => [t.id, t.email]));
  console.log('\nFinal booking statuses for this occurrence:');
  console.table((finalBookings ?? []).map((b) => ({ email: testerIdSet.get(b.client_id), status: b.status })));

  const testerIds = testers.map((t) => t.id);
  const { data: ledgerRows } = await admin
    .from('credits_ledger')
    .select('client_id, delta, reason, created_at')
    .in('client_id', testerIds)
    .order('created_at');
  console.log('\nCredits ledger activity for these 8 testers (grant -> book -> cancel/refund -> promotion):');
  console.table((ledgerRows ?? []).map((r) => ({ email: testerIdSet.get(r.client_id), delta: r.delta, reason: r.reason })));

  const { data: notifs } = await admin
    .from('notifications')
    .select('client_id, message')
    .in('client_id', testerIds)
    .ilike('message', '%waitlist%');
  console.log('\nWaitlist-promotion notifications sent:');
  console.table((notifs ?? []).map((n) => ({ email: testerIdSet.get(n.client_id), message: n.message })));

  console.log('\n=== Phase 5: Broader booking activity — 40 clients across all 5 classes ===');
  const broaderTesters = clients.slice(8, 48);
  let bookedTotal = 0;
  let waitlistTotal = 0;
  let failedTotal = 0;
  const classNames = Object.keys(classIds);
  for (const c of broaderTesters) {
    const chosenName = classNames[Math.floor(Math.random() * classNames.length)];
    const chosenDef = classDefs.find((d) => d.name === chosenName)!;
    const weeksOut = Math.floor(Math.random() * 3);
    const date = nextDateForWeekday(chosenDef.day_of_week, addDays(today, weeksOut * 7));
    try {
      const client = await signedInClient(c.email, c.password);
      const { data, error } = await client.rpc('book_class', {
        p_class_id: classIds[chosenName], p_booking_date: date,
      });
      if (error) throw error;
      if (data.status === 'booked') bookedTotal++;
      else waitlistTotal++;
      await client.auth.signOut();
    } catch {
      failedTotal++;
    }
  }
  console.log(`Booked: ${bookedTotal} · Waitlisted: ${waitlistTotal} · Failed/duplicate: ${failedTotal} (out of ${broaderTesters.length} attempts)\n`);

  console.log('=== Phase 6: Backfilling past attendance history for Reports ===');
  const pastTesters = clients.slice(48, 68);
  let attendedCount = 0;
  let noShowCount = 0;
  for (const c of pastTesters) {
    const chosenName = classNames[Math.floor(Math.random() * classNames.length)];
    const chosenDef = classDefs.find((d) => d.name === chosenName)!;
    const weeksAgo = 1 + Math.floor(Math.random() * 3);
    const pastDate = nextDateForWeekday(chosenDef.day_of_week, addDays(today, -weeksAgo * 7 - 7));
    const attended = Math.random() > 0.15;
    const { error } = await admin.from('bookings').insert({
      class_id: classIds[chosenName], client_id: c.id, booking_date: pastDate,
      status: 'booked', attended, attended_at: attended ? new Date().toISOString() : null,
    });
    if (!error) {
      await admin.from('credits_ledger').insert({
        client_id: c.id, delta: -1, reason: `booking:${chosenName}:${pastDate}`,
      });
      if (attended) attendedCount++;
      else noShowCount++;
    }
  }
  console.log(`Backfilled ${attendedCount} attended + ${noShowCount} no-show past bookings for Reports.\n`);

  console.log('=== Summary ===');
  console.log(`${clients.length} dummy clients created under coach ${COACH_ID}`);
  console.log(`${Object.keys(classIds).length} classes created`);
  console.log('Emails: stress-test-001@example.com .. stress-test-100@example.com');
  console.log('This data is persistent -- not auto-cleaned up.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
