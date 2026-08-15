'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { messageToHtml, sendBroadcastEmail, subjectFromMessage } from '@/lib/email';
import type { ScheduledCommunicationRow } from './types';

export async function getCommunications(): Promise<ScheduledCommunicationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('scheduled_communications')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

// "Send now" never calls the send_due_communications RPC -- it inserts chat_messages directly
// under the caller's own RLS-scoped session, exactly like sendMessage() in chat.ts does for a
// single client. This keeps the RPC genuinely cron-only (see migration 0031's comment) with no
// application code path that could race it or need it granted to `authenticated`. Email for an
// immediate send goes out the same way, in this same request, rather than waiting on the cron --
// profiles.email is already RLS-readable for the coach's own clients (see schema.sql), so no
// admin client is needed here even though the cron route uses one for the scheduled path.
export async function composeCommunication(
  message: string,
  target: { type: 'all_clients' } | { type: 'group'; groupId: string },
  sendAt: string,
  clientIds: string[],
  channel: 'message' | 'email' | 'both' = 'message'
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const sendImmediately = new Date(sendAt).getTime() <= Date.now();

  const { data: inserted, error } = await supabase
    .from('scheduled_communications')
    .insert({
      coach_id: user.id,
      message,
      target_type: target.type,
      target_group_id: target.type === 'group' ? target.groupId : null,
      send_at: sendAt,
      channel,
    })
    .select('id')
    .single();
  if (error) raise(error);

  if (sendImmediately) {
    if (clientIds.length > 0 && (channel === 'message' || channel === 'both')) {
      const { error: sendError } = await supabase
        .from('chat_messages')
        .insert(clientIds.map((clientId) => ({ client_id: clientId, sender_id: user.id, text: message })));
      if (sendError) raise(sendError);
    }

    let emailSentAt: string | null = null;
    if (clientIds.length > 0 && (channel === 'email' || channel === 'both')) {
      const { data: recipients, error: profilesError } = await supabase
        .from('profiles')
        .select('email, client_profiles(email_notifications_enabled)')
        .in('id', clientIds);
      if (profilesError) raise(profilesError);
      // Opted-out clients are skipped, not just muted -- same shape as notifications_enabled's
      // existing gate on send_checkin_reminders.
      const optedIn = (recipients ?? []).filter((r) => {
        const profile = Array.isArray(r.client_profiles) ? r.client_profiles[0] : r.client_profiles;
        return profile?.email_notifications_enabled ?? true;
      });
      const result = await sendBroadcastEmail(optedIn, subjectFromMessage(message), messageToHtml(message));
      if (!result.skipped) emailSentAt = new Date().toISOString();
    }

    const { error: markError } = await supabase
      .from('scheduled_communications')
      .update({ sent_at: new Date().toISOString(), email_sent_at: emailSentAt })
      .eq('id', inserted!.id);
    if (markError) raise(markError);
  }
}

export async function deleteCommunication(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('scheduled_communications').delete().eq('id', id).is('sent_at', null);
  if (error) raise(error);
}
