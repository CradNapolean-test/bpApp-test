'use server';

import { createClient } from '@/lib/supabase/server';
import type { ClientProfileRow } from './types';

export async function getClientProfile(clientId: string): Promise<ClientProfileRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function upsertClientProfile(
  clientId: string,
  fields: Omit<ClientProfileRow, 'client_id' | 'checkin_reminder_days' | 'last_checkin_reminder_at'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ client_id: clientId, ...fields, updated_at: new Date().toISOString() });
  if (error) throw error;
}

// Narrow, coach-only update -- separate from upsertClientProfile (the client's own Setup
// form) since this is a coach-configured setting the client doesn't edit themselves.
// Goes through set_checkin_reminder_days (0011_coach_sets_checkin_reminder.sql) rather than
// a raw update -- client_profiles' RLS update policy only covers is_self(client_id), so a
// direct update from the coach's session silently matches zero rows.
export async function updateCheckinReminderDays(clientId: string, days: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_checkin_reminder_days', {
    p_client_id: clientId,
    p_days: days,
  });
  if (error) throw error;
}
