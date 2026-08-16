import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToClient } from '@/lib/push';

// Triggered daily by Vercel Cron (see vercel.json). The underlying RPC throttles repeat
// reminders to each client's own checkin_reminder_days cadence via last_checkin_reminder_at,
// so a daily trigger doesn't mean daily notifications once someone goes quiet.
//
// send_checkin_reminders (migration 0060) now returns the client_ids it actually notified
// (was just a count) specifically so this route can trigger a push send per client -- the
// first notification path wired to Web Push; every other notifications-writing RPC still
// only writes the in-app row (see GAP_ROADMAP.md for the follow-up to generalize this).
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data, error } = await admin.rpc('send_checkin_reminders');
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const clientIds: string[] = data ?? [];
  await Promise.all(
    clientIds.map((clientId) =>
      sendPushToClient(clientId, {
        title: 'Check in with your coach',
        body: "Haven't seen a check-in from you in a few days — how's it going?",
        url: '/dashboard',
      }).catch(() => {
        // Best-effort -- the in-app notification (already written by the RPC) is the
        // source of truth; a push delivery failure shouldn't fail the whole cron run.
      })
    )
  );

  return NextResponse.json({ remindersSent: clientIds.length });
}
