'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ChatMessageRow, ChatOverviewRow } from './types';

export async function getMessages(clientId: string): Promise<ChatMessageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) raise(error);
  return data ?? [];
}

export async function sendMessage(clientId: string, text: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase
    .from('chat_messages')
    .insert({ client_id: clientId, sender_id: user.id, text });
  if (error) raise(error);
}

export async function getCoachChatOverview(): Promise<ChatOverviewRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_coach_chat_overview');
  if (error) raise(error);
  return data ?? [];
}

export async function markChatRead(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_chat_read', { p_client_id: clientId });
  if (error) raise(error);
}
