import { NextResponse } from 'next/server';
import { isAuthorizedCron } from '@/lib/cronAuth';
import { createAdminClient } from '@/lib/supabase/admin';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { recordJobRun } from '@/lib/jobRuns';

// Triggered daily by Vercel Cron (see vercel.json). The underlying RPC throttles repeat
// reminders to each client's own checkin_reminder_days cadence via last_checkin_reminder_at,
// so a daily trigger doesn't mean daily notifications once someone goes quiet.
//
// send_checkin_reminders (migration 0060) now returns the client_ids it actually notified
// (was just a count) specifically so this route can trigger a push send per client -- the
// first notification path wired to Web Push; every other notifications-writing RPC still
// only writes the in-app row (see GAP_ROADMAP.md for the follow-up to generalize this).
export async function GET(request: Request) {
  // Refuses everyone when the secret is not set (lib/cronAuth.ts), instead of accepting "Bearer undefined".
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('send_checkin_reminders');
  if (error) {
    await recordJobRun('checkin-reminders', false, error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clientIds: string[] = data ?? [];
  // Best-effort -- the in-app notification (already written by the RPC) is the source of truth; a push delivery failure shouldn't fail the
  // whole cron run. The result is counted and reported (R41) instead of thrown away.
  const results = await Promise.all(
    clientIds.map((clientId) =>
      pushQuietly('check-in reminder', () =>
        sendPushToClient(clientId, {
          title: 'Check in with your coach',
          body: "Haven't seen a check-in from you in a few days — how's it going?",
          url: '/dashboard',
        })
      )
    )
  );
  const pushSent = results.reduce((n, r) => n + (r?.sent ?? 0), 0);
  const pushFailed = results.reduce((n, r) => n + (r ? r.failed : 1), 0);

  await recordJobRun('checkin-reminders', true, `${clientIds.length} reminded, push sent ${pushSent} failed ${pushFailed}`);
  return NextResponse.json({ remindersSent: clientIds.length, pushSent, pushFailed });
}
