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

// Marks every unread notification of the signed-in member read in one call (mark_all_notifications_read, migration 0136). The bell used
// to send one request per notification, up to 50 at once (NO1). Falls back to a single bulk update if the function is not there yet.
export async function markAllNotificationsRead(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (!error) return;
  const { error: fallbackError } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('client_id', clientId)
    .is('read_at', null);
  if (fallbackError) raise(fallbackError);
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
