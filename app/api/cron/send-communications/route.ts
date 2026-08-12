import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { messageToHtml, sendBroadcastEmail, subjectFromMessage } from '@/lib/email';

// Triggered daily by Vercel Cron (see vercel.json). Only processes scheduled_communications
// rows whose send_at has passed -- "send now" broadcasts never reach this function at all,
// see composeCommunication in lib/data/communications.ts.
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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Pass 2: email channel. Only rows already processed for their message-audience (sent_at is
  // not null, whether or not this row even uses the message channel -- the RPC always stamps
  // sent_at once a row is "due") and not yet processed for email specifically.
  const { data: dueEmails, error: dueError } = await admin
    .from('scheduled_communications')
    .select('id, coach_id, message, target_type, target_group_id')
    .in('channel', ['email', 'both'])
    .is('email_sent_at', null)
    .not('sent_at', 'is', null);
  if (dueError) {
    return NextResponse.json({ messagesSent: data, error: dueError.message }, { status: 500 });
  }

  let emailsSent = 0;
  for (const comm of dueEmails ?? []) {
    let clientIds: string[] = [];
    if (comm.target_type === 'all_clients') {
      const { data: clients } = await admin.from('profiles').select('id').eq('coach_id', comm.coach_id);
      clientIds = (clients ?? []).map((c) => c.id);
    } else if (comm.target_group_id) {
      const { data: members } = await admin
        .from('client_group_members')
        .select('client_id')
        .eq('group_id', comm.target_group_id);
      clientIds = (members ?? []).map((m) => m.client_id);
    }
    if (clientIds.length === 0) {
      await admin.from('scheduled_communications').update({ email_sent_at: new Date().toISOString() }).eq('id', comm.id);
      continue;
    }

    const { data: recipients } = await admin.from('profiles').select('email').in('id', clientIds);
    const result = await sendBroadcastEmail(recipients ?? [], subjectFromMessage(comm.message), messageToHtml(comm.message));
    if (!result.skipped) {
      emailsSent += result.sent;
      await admin.from('scheduled_communications').update({ email_sent_at: new Date().toISOString() }).eq('id', comm.id);
    }
  }

  return NextResponse.json({ messagesSent: data, emailsSent });
}
