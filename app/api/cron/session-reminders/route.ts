import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { checkPushConfig } from '@/lib/pushConfig';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { recordJobRun } from '@/lib/jobRuns';
import { isMissingColumnError } from '@/lib/onboarding';
import { dueReminders, sessionReminderPayload, type ReminderBooking } from '@/lib/sessionReminders';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';

// The reminder before a booked session (decision D20): a push about 2 hours before it starts (the evening before for an early class, see
// lib/sessionReminders.ts). Vercel's Hobby plan only runs jobs once a day, so this is called every hour by the GitHub Actions workflow in
// .github/workflows/hourly-broadcasts.yml, with the same CRON_SECRET as the daily jobs (it does nothing until that secret is added to the
// repository on GitHub).
//
// Never twice for the same booking: each due booking is first claimed in session_reminders (migration 0160; the booking id is its primary
// key, so a second claim, from a later run or one running at the same time, adds nothing), and only the bookings this run claimed are
// pushed. If the claim fails nothing is pushed. While push is switched off (no VAPID keys, lib/push.ts) nothing is claimed either, so the
// table only holds reminders that were really attempted. Members who turned reminders off (client_profiles.notifications_enabled, the
// same switch the birthday and check-in pushes follow) are left out.

const PAGE = 1000;
const MAX_PAGES = 10;
const KEEP_DAYS = 30;

type BookingRow = {
  id: string;
  client_id: string;
  class_id: string;
  booking_date: string;
  created_at: string;
  promoted_at?: string | null;
  classes: { name: string; start_time: string | null; gym_id: string | null } | { name: string; start_time: string | null; gym_id: string | null }[] | null;
};

const isoDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const push = checkPushConfig({
    VAPID_PUBLIC_KEY: process.env.VAPID_PUBLIC_KEY,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    SUPPORT_EMAIL: process.env.SUPPORT_EMAIL,
  });
  if (!push.ok) {
    await recordJobRun('session-reminders', true, `push is off (${push.reason}): nothing sent`);
    return NextResponse.json({ due: 0, sent: 0, skipped: push.reason });
  }

  const admin = createAdminClient();
  const now = new Date();
  // Booked sessions from yesterday to two days ahead (UTC dates), which covers today and tomorrow at any gym.
  const from = isoDay(now.getTime() - 24 * 60 * 60 * 1000);
  const to = isoDay(now.getTime() + 2 * 24 * 60 * 60 * 1000);
  const read = async (withPromoted: boolean) => {
    const rows: BookingRow[] = [];
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const { data, error } = await admin
        .from('bookings')
        .select(`id, client_id, class_id, booking_date, created_at${withPromoted ? ', promoted_at' : ''}, classes(name, start_time, gym_id)`)
        .eq('status', 'booked')
        .gte('booking_date', from)
        .lte('booking_date', to)
        .order('id')
        .range(page * PAGE, page * PAGE + PAGE - 1);
      if (error) return { rows, error };
      rows.push(...((data ?? []) as unknown as BookingRow[]));
      if (!data || data.length < PAGE) break;
    }
    return { rows, error: null };
  };
  let found = await read(true);
  // Before migration 0158 there is no promoted_at: the booking's own time is used.
  if (found.error && isMissingColumnError(found.error, 'promoted_at')) found = await read(false);
  if (found.error) {
    await recordJobRun('session-reminders', false, `read failed: ${found.error.message}`);
    return NextResponse.json({ error: found.error.message }, { status: 500 });
  }

  const bookings = found.rows;
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);
  const gymIds = [...new Set(bookings.map((b) => one(b.classes)?.gym_id).filter((id): id is string => !!id))];
  const classIds = [...new Set(bookings.map((b) => b.class_id))];
  const [gyms, exceptions] = await Promise.all([
    gymIds.length ? admin.from('gyms').select('id, timezone').in('id', gymIds) : Promise.resolve({ data: [] }),
    classIds.length
      ? admin.from('class_exceptions').select('class_id, occurrence_date').in('class_id', classIds).gte('occurrence_date', from).lte('occurrence_date', to)
      : Promise.resolve({ data: [], error: null }),
  ]);
  // Without the cancelled sessions nobody is reminded, rather than someone whose session is off; the next run tries again.
  if (exceptions.error) {
    await recordJobRun('session-reminders', false, `cancelled-session read failed, nothing sent: ${exceptions.error.message}`);
    return NextResponse.json({ error: exceptions.error.message }, { status: 500 });
  }
  const zone = new Map(((gyms.data ?? []) as { id: string; timezone: string | null }[]).map((g) => [g.id, g.timezone || DEFAULT_TIMEZONE]));
  const cancelled = new Set(((exceptions.data ?? []) as { class_id: string; occurrence_date: string }[]).map((e) => `${e.class_id}:${e.occurrence_date}`));

  const candidates: ReminderBooking[] = [];
  for (const b of bookings) {
    const session = one(b.classes);
    if (!session || cancelled.has(`${b.class_id}:${b.booking_date}`)) continue;
    candidates.push({
      bookingId: b.id,
      clientId: b.client_id,
      className: session.name,
      date: b.booking_date,
      startTime: session.start_time,
      timeZone: (session.gym_id && zone.get(session.gym_id)) || DEFAULT_TIMEZONE,
      bookedAt: b.promoted_at ?? b.created_at,
    });
  }
  // The opt-outs are read for this hour's members only (a short list), not for every booking in the window.
  const dueNow = dueReminders(candidates, now);
  const dueClients = [...new Set(dueNow.map((d) => d.clientId))];
  const { data: profiles, error: profilesError } = dueClients.length
    ? await admin.from('client_profiles').select('client_id, notifications_enabled').in('client_id', dueClients)
    : { data: [], error: null };
  // Without the opt-outs nobody is reminded, rather than someone who turned reminders off; the next run tries again.
  if (profilesError) {
    await recordJobRun('session-reminders', false, `opt-out read failed, nothing sent: ${profilesError.message}`);
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }
  const optedOut = new Set(
    ((profiles ?? []) as { client_id: string; notifications_enabled: boolean | null }[]).filter((p) => p.notifications_enabled === false).map((p) => p.client_id)
  );
  const due = dueNow.filter((d) => !optedOut.has(d.clientId));
  if (due.length === 0) {
    await recordJobRun('session-reminders', true, `0 due of ${bookings.length} booked`);
    return NextResponse.json({ due: 0, sent: 0 });
  }

  // Claim first: only the bookings this run claims are pushed, so no booking is reminded twice.
  const { data: claimed, error: claimError } = await admin
    .from('session_reminders')
    .upsert(
      due.map((d) => ({ booking_id: d.bookingId })),
      { onConflict: 'booking_id', ignoreDuplicates: true }
    )
    .select('booking_id');
  if (claimError) {
    await recordJobRun('session-reminders', false, `claim failed, nothing sent: ${claimError.message}`);
    return NextResponse.json({ error: claimError.message }, { status: 500 });
  }
  const mine = new Set(((claimed ?? []) as { booking_id: string }[]).map((c) => c.booking_id));

  let sent = 0;
  let failed = 0;
  await Promise.all(
    due
      .filter((d) => mine.has(d.bookingId))
      .map(async (d) => {
        const result = await pushQuietly('session reminder', () => sendPushToClient(d.clientId, sessionReminderPayload(d)));
        sent += result?.sent ?? 0;
        failed += result?.failed ?? (result ? 0 : 1);
      })
  );

  // Old claims are no longer needed (a booking's session is long past); a deleted booking takes its claim with it.
  await admin
    .from('session_reminders')
    .delete()
    .lt('sent_at', new Date(now.getTime() - KEEP_DAYS * 24 * 60 * 60 * 1000).toISOString());

  const detail = `${due.length} due, ${mine.size} newly claimed, ${sent} pushes sent, ${failed} failed`;
  await recordJobRun('session-reminders', !(failed > 0 && sent === 0), detail);
  return NextResponse.json({ due: due.length, claimed: mine.size, sent, failed });
}
