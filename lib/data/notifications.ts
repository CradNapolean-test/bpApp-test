'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { NotificationRow } from './types';

// Everything the member hasn't cleared (seen or not), newest first. Before migration 0086 adds
// cleared_at, falls back to the old behaviour (unread only) so the dashboard never breaks.
export async function getNotifications(clientId: string): Promise<NotificationRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('client_id', clientId)
    .is('cleared_at', null)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    if (error.code === '42703') {
      const legacy = await supabase
        .from('notifications')
        .select('*')
        .eq('client_id', clientId)
        .is('read_at', null)
        .order('created_at', { ascending: false });
      if (legacy.error) raise(legacy.error);
      return legacy.data ?? [];
    }
    raise(error);
  }
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

// Dismiss one notification (and count it as seen).
export async function clearNotification(id: string): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase.from('notifications').update({ cleared_at: now, read_at: now }).eq('id', id);
  if (error) raise(error);
}

export async function clearAllNotifications(clientId: string): Promise<void> {
  const supabase = await createClient();
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('notifications')
    .update({ cleared_at: now, read_at: now })
    .eq('client_id', clientId)
    .is('cleared_at', null);
  if (error) raise(error);
}
