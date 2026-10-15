'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import { sendPersonalisedEmails } from '@/lib/email';
import { emailNotice } from '@/lib/emailOutcome';
import { recordEmailOutcome } from '@/lib/emailRecord';
import type { ScheduledCommunicationRow } from './types';

// A broadcast is also a chat message to each member, and a chat message is limited to 4,000 characters (migration 0108). The database
// would refuse a longer one with a technical error after the audience was worked out, so it is checked here first.
const MAX_BROADCAST_LENGTH = 4000;

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
  // The gym the page was drawn for (R28): "whole gym" and groups mean that gym's members, so a tab left open on an old gym must not send.
  expectedGymId?: string | null;
}): Promise<ActionResult & { emailNotice?: string | null }> {
  const text = input.message.trim();
  if (!text) return fail({ message: 'Write a message first' });
  if (text.length > MAX_BROADCAST_LENGTH) {
    return fail({ message: `That message is ${text.length.toLocaleString('en-GB')} characters. The limit is ${MAX_BROADCAST_LENGTH.toLocaleString('en-GB')}: shorten it by ${(text.length - MAX_BROADCAST_LENGTH).toLocaleString('en-GB')}.` });
  }
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, input.expectedGymId);
  if (stale) return stale;
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
  let notice: string | null = null;
  if (result?.sent_now && result.recipients.length > 0 && (input.channel === 'email' || input.channel === 'both')) {
    const { data: people } = await supabase
      .from('profiles')
      .select('id, email, client_profiles(name, email_notifications_enabled)')
      .in('id', result.recipients);
    // Opted-out clients are skipped, not just muted -- same shape as notifications_enabled's existing gate on
    // send_checkin_reminders.
    const optedIn = (people ?? [])
      .map((r) => {
        const profile = Array.isArray(r.client_profiles) ? r.client_profiles[0] : r.client_profiles;
        return { id: r.id as string, email: r.email as string, name: (profile?.name as string | null) ?? null, on: profile?.email_notifications_enabled ?? true };
      })
      .filter((r) => r.on && r.email);
    // Replies go to the coach who sent it. The email is stamped as sent only if at least one really went; what happened is kept on the
    // row (CM1), and the coach is told when it did not go.
    const { data: auth } = await supabase.auth.getUser();
    const sent = await sendPersonalisedEmails(
      optedIn.map((r) => ({ email: r.email, name: r.name, memberId: r.id })),
      text,
      undefined,
      { replyTo: auth.user?.email ?? undefined }
    );
    await recordEmailOutcome(supabase, result.id, sent, 0);
    notice = emailNotice(sent);
  }
  return { ...ok(), emailNotice: notice };
}

// How many clients each audience reaches, for the "This will message N" line: the coach's own, and the whole gym. "Whole gym" is the
// MEMBERS who belong to the gym being worked in (by their own gym), the same people communication_recipients picks (migration 0130).
// It used to count the members of the coaches whose active gym was this one, so a coach in two gyms was told "90 clients" at a gym
// with none (R38).
export async function getAudienceCounts(): Promise<{ mine: number; gym: number }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { mine: 0, gym: 0 };
  const gymId = await resolveScopingGymId(supabase);
  const [{ count: mine }, { count: gym }] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').eq('coach_id', user.id),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').eq('gym_id', gymId),
  ]);
  return { mine: mine ?? 0, gym: gym ?? 0 };
}

export async function deleteCommunication(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('scheduled_communications').delete().eq('id', id).is('sent_at', null);
  if (error) raise(error);
}
