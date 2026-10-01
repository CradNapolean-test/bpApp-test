'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ChatMessage, ChatMessageRow, ChatOverviewRow } from './types';

const SIGNED_URL_TTL_SECONDS = 60 * 10;

export async function getMessages(clientId: string): Promise<ChatMessage[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: true });
  if (error) raise(error);

  const rows = (data ?? []) as ChatMessageRow[];
  return Promise.all(
    rows.map(async (row) => {
      let signedAudioUrl: string | null = null;
      let signedImageUrl: string | null = null;
      if (row.audio_path) {
        const { data: signed } = await supabase.storage
          .from('voice-notes')
          .createSignedUrl(row.audio_path, SIGNED_URL_TTL_SECONDS);
        signedAudioUrl = signed?.signedUrl ?? null;
      }
      if (row.image_path) {
        const { data: signed } = await supabase.storage
          .from('chat-photos')
          .createSignedUrl(row.image_path, SIGNED_URL_TTL_SECONDS);
        signedImageUrl = signed?.signedUrl ?? null;
      }
      return { ...row, signedAudioUrl, signedImageUrl };
    })
  );
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

// Mirrors uploadProgressPhoto/uploadFoodPhoto's FormData-in convention -- the documented-safe
// way to pass a File/Blob through a Next.js Server Action. Duration comes from the client
// (VoiceRecorder's own timer) since there's no reliable way to read it server-side from a webm
// Blob without a media-parsing dependency.
export async function sendVoiceNote(clientId: string, formData: FormData): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const file = formData.get('file') as File | null;
  const durationRaw = formData.get('duration');
  if (!file) throw new Error('Missing audio file');
  const duration = durationRaw ? Number(durationRaw) : null;

  const path = `${clientId}/${crypto.randomUUID()}.webm`;
  const { error: uploadError } = await supabase.storage.from('voice-notes').upload(path, file);
  if (uploadError) raise(uploadError);

  const { error } = await supabase.from('chat_messages').insert({
    client_id: clientId,
    sender_id: user.id,
    text: null,
    audio_path: path,
    audio_duration_seconds: duration,
  });
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
