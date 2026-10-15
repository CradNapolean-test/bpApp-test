'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { after } from 'next/server';
import { notifyAfterMessage } from '@/lib/chatNotify';
import { CHAT_CATCH_UP_MAX, CHAT_PAGE, pageOfNewestFirst } from '@/lib/chatMessages';
import type { ChatMessage, ChatMessageRow, ChatOverviewRow } from './types';

// Who is pinged after a message is stored is decided in lib/chatNotify.ts: a coach's message pings the member's phone, and a member's message
// pings their coach (quiet hours and one push per burst apply, and the push never carries the text, R40). It runs with after(), once the
// response has gone, so a slow push service cannot slow the sender (R41), and push trouble never fails the send.

// Photos are inserted straight from the browser, so the browser calls this afterwards. It only
// pushes if the caller really did just send a photo into this thread (RLS decides what they see).
export async function notifyPhotoSent(clientId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('chat_messages')
    .select('id, created_at')
    .eq('client_id', clientId)
    .eq('sender_id', user.id)
    .not('image_path', 'is', null)
    .gt('created_at', since)
    .limit(1);
  if (!data?.length) return;
  after(() => notifyAfterMessage({ senderId: user.id, clientId, preview: '📷 Sent you a photo', createdAt: data[0].created_at as string }));
}

// A message as the screen holds it. The links to photos and voice notes are not made here: signing every attachment of a thread cost
// one request each on every load, so the chat window signs an attachment when its message scrolls into view (H5).
function toMessage(row: ChatMessageRow): ChatMessage {
  return { ...row, signedAudioUrl: null, signedImageUrl: null };
}

// The latest page of a thread, oldest first. Reading the whole thread, oldest first, stopped at the database's 1,000-row cap and so
// dropped the newest messages (H5); "Load earlier" asks for older pages.
export async function getMessages(clientId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHAT_PAGE);
  if (error) raise(error);
  return pageOfNewestFirst((data ?? []) as ChatMessageRow[], CHAT_PAGE).rows.map(toMessage);
}

// The page of messages before `beforeIso` (the oldest one on screen), and whether there are still older ones.
export async function getEarlierMessages(clientId: string, beforeIso: string): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('client_id', clientId)
    .lt('created_at', beforeIso)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHAT_PAGE + 1);
  if (error) raise(error);
  const page = pageOfNewestFirst((data ?? []) as ChatMessageRow[], CHAT_PAGE);
  return { messages: page.rows.map(toMessage), hasMore: page.hasMore };
}

// Everything after `afterIso`: what a chat window asks for when its live connection came back or the page was left and returned to,
// so a message that arrived while it was deaf still shows up (M5).
export async function getMessagesSince(clientId: string, afterIso: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('client_id', clientId)
    .gt('created_at', afterIso)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(CHAT_CATCH_UP_MAX);
  if (error) raise(error);
  return pageOfNewestFirst((data ?? []) as ChatMessageRow[], CHAT_CATCH_UP_MAX).rows.map(toMessage);
}

// Returns the saved row so the sender's screen can show the message at once instead of waiting for the live connection to deliver it
// (with the connection down the sender saw nothing and sent it again, M5).
export async function sendMessage(clientId: string, text: string): Promise<ChatMessage> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ client_id: clientId, sender_id: user.id, text })
    .select('*')
    .single();
  if (error) raise(error);
  const saved = data as ChatMessageRow;
  after(() => notifyAfterMessage({ senderId: user.id, clientId, preview: text, createdAt: saved.created_at }));
  return toMessage(saved);
}

// Voice notes go from the browser straight to storage and into the thread, like photos (the action used to carry the recording, which
// is capped at 4 MB, M4). The browser calls this afterwards; it only pushes if the caller really did just send a voice note here.
export async function notifyVoiceSent(clientId: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  const since = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await supabase
    .from('chat_messages')
    .select('id, created_at')
    .eq('client_id', clientId)
    .eq('sender_id', user.id)
    .not('audio_path', 'is', null)
    .gt('created_at', since)
    .limit(1);
  if (!data?.length) return;
  after(() => notifyAfterMessage({ senderId: user.id, clientId, preview: '🎤 Sent you a voice note', createdAt: data[0].created_at as string }));
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

// Puts a conversation back to unread (their latest message counts as new again). Needs migration 0099.
export async function markChatUnread(clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('mark_chat_unread', { p_client_id: clientId });
  if (error) raise(error);
}

// For the client's own unread indicator (the header Messages icon) -- mirrors the shape
// get_coach_chat_overview uses for the coach's side, just scoped to one thread.
export async function getClientUnreadCount(clientId: string): Promise<number> {
  const supabase = await createClient();
  const { data: thread, error: threadError } = await supabase
    .from('chat_threads')
    .select('client_last_read_at')
    .eq('client_id', clientId)
    .maybeSingle();
  if (threadError) raise(threadError);

  const since = thread?.client_last_read_at ?? '1970-01-01T00:00:00Z';
  const { count, error } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .neq('sender_id', clientId)
    .gt('created_at', since);
  if (error) raise(error);
  return count ?? 0;
}
