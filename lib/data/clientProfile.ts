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
export async function updateCheckinReminderDays(clientId: string, days: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .update({ checkin_reminder_days: days })
    .eq('client_id', clientId);
  if (error) throw error;
}
