'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import { messageToHtml, sendBroadcastEmail } from '@/lib/email';
import type { ClientProfileRow } from './types';

export async function getClientProfile(clientId: string): Promise<ClientProfileRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

export async function upsertClientProfile(
  clientId: string,
  fields: Omit<
    ClientProfileRow,
    | 'client_id'
    | 'checkin_reminder_days'
    | 'last_checkin_reminder_at'
    | 'notifications_enabled'
    | 'email_notifications_enabled'
    | 'nutrition_tracking_mode'
    | 'join_date'
    | 'referral_source'
    | 'admin_notes'
    | 'deletion_requested_at'
  >
): Promise<void> {
  const supabase = await createClient();

  // Seed checkin_reminder_days from the client's coach's own default (profiles
  // .default_checkin_reminder_days, 0042) the first time this client's row is created --
  // but only then. Once a row exists, the coach may have already overridden it per-client
  // via updateCheckinReminderDays below, and every later call here is just the client's own
  // Setup-tab edits, which must never clobber that.
  const { data: existing } = await supabase
    .from('client_profiles')
    .select('client_id')
    .eq('client_id', clientId)
    .maybeSingle();

  let seed: { checkin_reminder_days?: number } = {};
  if (!existing) {
    const { data: withCoach } = await supabase
      .from('profiles')
      .select('coach:coach_id(default_checkin_reminder_days)')
      .eq('id', clientId)
      .single();
    const coach = Array.isArray(withCoach?.coach) ? withCoach.coach[0] : withCoach?.coach;
    if (coach?.default_checkin_reminder_days != null) {
      seed = { checkin_reminder_days: coach.default_checkin_reminder_days };
    }
  }

  const { error } = await supabase
    .from('client_profiles')
    .upsert({ client_id: clientId, ...fields, ...seed, updated_at: new Date().toISOString() });
  if (error) raise(error);
}

// Narrow, coach-only update -- separate from upsertClientProfile (the client's own Setup
// form) since this is a coach-configured setting the client doesn't edit themselves.
// Goes through set_checkin_reminder_days (0011_coach_sets_checkin_reminder.sql) rather than
// a raw update -- client_profiles' RLS update policy only covers is_self(client_id), so a
// direct update from the coach's session silently matches zero rows.
export async function updateCheckinReminderDays(clientId: string, days: number): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_checkin_reminder_days', {
    p_client_id: clientId,
    p_days: days,
  });
  return error ? fail(error, 'Could not save the reminder setting') : ok();
}

// Client-owned, unlike checkin_reminder_days -- client_profiles' existing "client updates own
// client_profiles" policy (is_self-scoped) already covers this, so a plain direct update is
// enough, no RPC needed.
export async function updateNotificationsEnabled(clientId: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .update({ notifications_enabled: enabled })
    .eq('client_id', clientId);
  return error ? fail(error, 'Could not save the notification setting') : ok();
}

// Client-owned, same shape as updateNotificationsEnabled -- gates broadcast emails
// specifically (see migration 0045), distinct from that in-app check-in-reminder toggle.
export async function updateEmailNotificationsEnabled(clientId: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .update({ email_notifications_enabled: enabled })
    .eq('client_id', clientId);
  return error ? fail(error, 'Could not save the notification setting') : ok();
}

// Coach-only admin fields (join date, referral source, contract/agreement notes) -- goes
// through set_client_admin_details (0046) rather than a raw update, same reasoning as
// updateCheckinReminderDays: client_profiles' RLS update policy is is_self-scoped only, so a
// direct update from the coach's session would silently match zero rows.
// Client-owned request flag, not a real delete -- the coach sees deletion_requested_at set
// (ClientTable.tsx surfaces it as a badge/filter) and handles the actual delete themselves.
// Symmetric cancel alongside it so a client who changes their mind isn't stuck.
export async function requestAccountDeletion(clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .update({ deletion_requested_at: new Date().toISOString() })
    .eq('client_id', clientId);
  if (error) return fail(error, 'Could not submit the request');

  // Best-effort email to the coach -- get_my_coach_email (0048) is the narrow read-only
  // exception needed since a client can't otherwise read their coach's own profiles row.
  // Never blocks the request itself on email failure; the in-app badge is the source of truth.
  try {
    const { data: coachEmail } = await supabase.rpc('get_my_coach_email');
    if (coachEmail) {
      await sendBroadcastEmail(
        [{ email: coachEmail }],
        'Account deletion request',
        messageToHtml('A client has requested their account be deleted. Check your Clients list for details.')
      );
    }
  } catch {
    // Swallowed deliberately -- see comment above.
  }

  return ok();
}

export async function cancelAccountDeletionRequest(clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .update({ deletion_requested_at: null })
    .eq('client_id', clientId);
  return error ? fail(error, 'Could not cancel the request') : ok();
}

export async function updateClientAdminDetails(
  clientId: string,
  fields: { joinDate: string | null; referralSource: string | null; adminNotes: string | null }
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_client_admin_details', {
    p_client_id: clientId,
    p_join_date: fields.joinDate,
    p_referral_source: fields.referralSource,
    p_admin_notes: fields.adminNotes,
  });
  return error ? fail(error, 'Could not save the client details') : ok();
}

// Coach-only, same reasoning as updateCheckinReminderDays -- client_profiles' RLS update
// policy is is_self(client_id) only, so this goes through a security-definer RPC
// (set_nutrition_tracking_mode, 0034) rather than a direct update from the coach's session.
export async function updateNutritionTrackingMode(
  clientId: string,
  mode: ClientProfileRow['nutrition_tracking_mode']
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_nutrition_tracking_mode', {
    p_client_id: clientId,
    p_mode: mode,
  });
  return error ? fail(error, 'Could not save the tracking mode') : ok();
}
