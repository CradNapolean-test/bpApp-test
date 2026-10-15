import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendPersonalisedEmails } from '@/lib/email';
import { EMAIL_RETRY_WINDOW_MS, shouldRetryEmail } from '@/lib/emailOutcome';
import { recordEmailOutcome } from '@/lib/emailRecord';
import { recordJobRun } from '@/lib/jobRuns';
import { isMissingColumnError } from '@/lib/onboarding';

// Triggered daily by Vercel Cron (see vercel.json). Only processes scheduled_communications
// rows whose send_at has passed -- "send now" broadcasts never reach this function at all,
// see composeCommunication in lib/data/communications.ts.
//
// Email (CM1): a broadcast is stamped as emailed only when at least one email really went. When none did, the row keeps why and how many
// attempts were made, and the next daily run tries again (up to MAX_EMAIL_ATTEMPTS, and only for broadcasts under three days old). A
// broadcast that was half sent is never re-sent: that would email the people who already got it a second time.
export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const admin = createAdminClient();

  // Pass 1: in-app message channel, unchanged RPC (locking, audience resolution, and setting
  // sent_at all still live in Postgres -- see migration 0039's comment on why email couldn't
  // just be added to this same function).
  const { data, error } = await admin.rpc('send_due_communications');
  if (error) {
    await recordJobRun('send-communications', false, `in-app pass failed: ${error.message}`);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pass 2: email channel. Only rows already processed for their message-audience (sent_at is
  // not null, whether or not this row even uses the message channel -- the RPC always stamps
  // sent_at once a row is "due") and not yet emailed.
  const cutoff = new Date(Date.now() - EMAIL_RETRY_WINDOW_MS).toISOString();
  const columns = 'id, coach_id, gym_id, message, target_type, target_group_id, sent_at, email_sent_at';
  const query = (withAttempts: boolean) =>
    admin
      .from('scheduled_communications')
      .select(withAttempts ? `${columns}, email_attempts` : columns)
      .in('channel', ['email', 'both'])
      .is('email_sent_at', null)
      .not('sent_at', 'is', null)
      .gte('sent_at', cutoff);
  let found = await query(true);
  // Before migration 0139 there is no attempts column: read without it rather than stop.
  if (found.error && isMissingColumnError(found.error, 'email_attempts')) found = await query(false);
  if (found.error) {
    await recordJobRun('send-communications', false, `email pass failed: ${found.error.message}`);
    return NextResponse.json({ messagesSent: data, error: found.error.message }, { status: 500 });
  }
  const now = Date.now();
  const dueEmails = ((found.data ?? []) as unknown as {
    id: string;
    coach_id: string;
    gym_id: string;
    message: string;
    target_type: string;
    target_group_id: string | null;
    sent_at: string;
    email_sent_at: string | null;
    email_attempts?: number | null;
  }[]).filter((row) => shouldRetryEmail(row, now));

  // Replies go to the coach who made the broadcast.
  const coachIds = [...new Set(dueEmails.map((c) => c.coach_id))];
  const { data: coachRows } = coachIds.length > 0 ? await admin.from('profiles').select('id, email').in('id', coachIds) : { data: [] };
  const coachEmail = new Map((coachRows ?? []).map((p) => [p.id as string, (p.email as string | null) ?? undefined]));

  let emailsSent = 0;
  let emailsFailed = 0;
  let notConfigured = 0;
  for (const comm of dueEmails) {
    // Same recipient list the in-app messages used (the coach's clients, the whole gym, or a group).
    const { data: recipientIds } = await admin.rpc('communication_recipients', {
      p_gym: comm.gym_id,
      p_coach: comm.coach_id,
      p_target: comm.target_type,
      p_group: comm.target_group_id,
    });
    const clientIds = (recipientIds ?? []) as string[];
    if (clientIds.length === 0) {
      await recordEmailOutcome(admin, comm.id, { sent: 0, failed: 0, skipped: false }, comm.email_attempts ?? 0);
      continue;
    }

    const { data: recipients } = await admin
      .from('profiles')
      .select('id, email, client_profiles(name, email_notifications_enabled)')
      .in('id', clientIds);
    // Opted-out clients are skipped, not just muted -- same shape as notifications_enabled's
    // existing gate on send_checkin_reminders.
    const optedIn = (recipients ?? [])
      .map((r) => {
        const profile = Array.isArray(r.client_profiles) ? r.client_profiles[0] : r.client_profiles;
        return { id: r.id as string, email: r.email as string, name: (profile?.name as string | null) ?? null, on: profile?.email_notifications_enabled ?? true };
      })
      .filter((r) => r.on && r.email);
    const result = await sendPersonalisedEmails(
      optedIn.map((r) => ({ email: r.email, name: r.name, memberId: r.id })),
      comm.message,
      undefined,
      { replyTo: coachEmail.get(comm.coach_id) }
    );
    await recordEmailOutcome(admin, comm.id, result, comm.email_attempts ?? 0);
    emailsSent += result.sent;
    emailsFailed += result.failed;
    if (result.skipped) notConfigured += 1;
  }

  const detail = `messages ${JSON.stringify(data)}, emails sent ${emailsSent}, failed ${emailsFailed}${notConfigured ? `, ${notConfigured} held (email not set up)` : ''}`;
  await recordJobRun('send-communications', !(emailsFailed > 0 && emailsSent === 0), detail);
  return NextResponse.json({ messagesSent: data, emailsSent, emailsFailed, emailNotConfigured: notConfigured });
}
