'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import { sendPersonalisedEmails } from '@/lib/email';
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

// Creates a broadcast. The database does the work (create_communication, migration 0097): it works out who the
// audience is (a coach's own clients, the whole gym, or a group), posts the in-app message to each of them when the
// time is now, and otherwise schedules it (once, or repeating weekly). Email can't be sent from the database, so for
// an immediate send the people it reached come back and the email goes out here.
export async function composeCommunication(input: {
  message: string;
  target: 'my_clients' | 'gym' | 'group';
  groupId?: string | null;
  sendAt: string;
  channel: 'message' | 'email' | 'both';
  repeat: 'none' | 'weekly';
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('create_communication', {
    p_message: input.message,
    p_target: input.target,
    p_group: input.target === 'group' ? (input.groupId ?? null) : null,
    p_send_at: input.sendAt,
    p_channel: input.channel,
    p_repeat: input.repeat,
  });
  if (error) return fail(error, 'Could not send that');

  const result = data as { id: string; sent_now: boolean; recipients: string[] } | null;
  if (result?.sent_now && result.recipients.length > 0 && (input.channel === 'email' || input.channel === 'both')) {
    const { data: people } = await supabase
      .from('profiles')
      .select('email, client_profiles(name, email_notifications_enabled)')
      .in('id', result.recipients);
    // Opted-out clients are skipped, not just muted -- same shape as notifications_enabled's existing gate on
    // send_checkin_reminders.
    const optedIn = (people ?? [])
      .map((r) => {
        const profile = Array.isArray(r.client_profiles) ? r.client_profiles[0] : r.client_profiles;
        return { email: r.email as string, name: (profile?.name as string | null) ?? null, on: profile?.email_notifications_enabled ?? true };
      })
      .filter((r) => r.on && r.email);
    const sent = await sendPersonalisedEmails(optedIn, input.message);
    if (!sent.skipped) {
      await supabase.from('scheduled_communications').update({ email_sent_at: new Date().toISOString() }).eq('id', result.id);
    }
  }
  return ok();
}

// How many clients each audience reaches, for the "This will message N" line: the coach's own, and the whole gym.
export async function getAudienceCounts(): Promise<{ mine: number; gym: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mine: 0, gym: 0 };
  const gymId = await resolveScopingGymId(supabase);
  const [{ count: mine }, { data: coaches }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').eq('coach_id', user.id),
    supabase.from('profiles').select('id').eq('role', 'coach').eq('gym_id', gymId),
  ]);
  const coachIds = (coaches ?? []).map((c) => c.id);
  const { count: gym } = coachIds.length
    ? await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').in('coach_id', coachIds)
    : { count: 0 };
  return { mine: mine ?? 0, gym: gym ?? 0 };
}

export async function deleteCommunication(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('scheduled_communications').delete().eq('id', id).is('sent_at', null);
  if (error) raise(error);
}
