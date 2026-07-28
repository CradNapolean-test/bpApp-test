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
  fields: Omit<ClientProfileRow, 'client_id'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_profiles')
    .upsert({ client_id: clientId, ...fields, updated_at: new Date().toISOString() });
  if (error) throw error;
}
