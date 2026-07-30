'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { NotificationRow } from './types';

export async function getUnreadNotifications(clientId: string): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('client_id', clientId)
    .is('read_at', null)
    .order('created_at', { ascending: false });
  if (error) raise(error);
  return data ?? [];
}

export async function markRead(id: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) raise(error);
}
