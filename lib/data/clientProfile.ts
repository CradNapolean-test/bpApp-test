'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
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
    | 'nutrition_tracking_mode'
  >
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ client_id: clientId, ...fields, updated_at: new Date().toISOString() });
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
