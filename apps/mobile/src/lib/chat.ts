import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import type { ChatMessageRow } from '@ballistic/shared/data/types';
import {
  CHAT_PAGE_SIZE,
  applyLatest,
  applyLive,
  applyOlder,
  chatStoragePath,
  newLocalId,
  normalizeOutgoingText,
  oldestCursor,
  voiceNoteFormat,
  type ChatThread,
} from '@ballistic/shared/utils/chat';

import { outboxAdd, outboxGet, outboxRemove, outboxUpdate, type OutboxItem } from '@/lib/chatOutbox';
import { shrinkPhoto, uploadFile } from '@/lib/media';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

const RESYNC_AFTER_AWAY_MS = 20_000;
const POLL_MS = 15_000;
const COLUMNS = 'id, client_id, sender_id, text, audio_path, audio_duration_seconds, image_path, created_at';

const threadKey = (clientId: string | undefined) => ['chat', clientId] as const;
const unreadKey = (clientId: string | undefined) => ['chat-unread', clientId] as const;

// A member's conversation is keyed by their own user id, which the session already holds. Using it directly lets the
// messages start loading at once instead of waiting for the profile request just to learn the id.
export function useOwnUserId(): string | undefined {
  return useSession().session?.user.id;
}

// Whether the chat screen is on screen right now: a message that arrives while it is counts as read at once.
let chatVisible = false;
export function setChatVisible(v: boolean) {
  chatVisible = v;
}

// The newest 30 messages. Later calls merge into what is already held, so scrolling back and live arrivals survive
// a refetch. Older pages come from loadOlder.
export function useChatThread(clientId: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: threadKey(clientId),
    enabled: !!clientId,
    queryFn: async (): Promise<ChatThread> => {
      const { data, error } = await supabase
        .from('chat_messages')
        .select(COLUMNS)
        .eq('client_id', clientId!)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE_SIZE);
      if (error) throw error;
      return applyLatest(qc.getQueryData<ChatThread>(threadKey(clientId)), (data ?? []) as ChatMessageRow[]);
    },
  });
}

export function useLoadOlder(clientId: string | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const held = qc.getQueryData<ChatThread>(threadKey(clientId));
      const cursor = held ? oldestCursor(held) : null;
      if (!held || !held.hasMore || !cursor) return;
      const { data, error } = await supabase
        .from('chat_messages')
        .select(COLUMNS)
        .eq('client_id', clientId!)
        .lt('created_at', cursor)
        .order('created_at', { ascending: false })
        .limit(CHAT_PAGE_SIZE);
      if (error) throw error;
      qc.setQueryData<ChatThread | undefined>(threadKey(clientId), (p) => (p ? applyOlder(p, (data ?? []) as ChatMessageRow[]) : p));
    },
  });
}

// Messages from the coach newer than the member's last read mark (same two small queries as the web header badge).
// Many screens show the count (the header, the Coach tab); only the app layout passes `onStart`, so the check on app
// start happens once and not again every time a screen opens.
export function useChatUnread(clientId: string | undefined, onStart = false) {
  return useQuery({
    queryKey: unreadKey(clientId),
    enabled: !!clientId,
    staleTime: 60_000,
    // The saved copy may predate messages that arrived while the app was closed, so check on every app start.
    refetchOnMount: onStart ? 'always' : true,
    queryFn: async (): Promise<number> => {
      const thread = await supabase.from('chat_threads').select('client_last_read_at').eq('client_id', clientId!).maybeSingle();
      if (thread.error) throw thread.error;
      const since = thread.data?.client_last_read_at ?? '1970-01-01T00:00:00Z';
      const { count, error } = await supabase
        .from('chat_messages')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', clientId!)
        .neq('sender_id', clientId!)
        .gt('created_at', since);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// Marks the thread read on the server (the RPC only ever sets the caller's own side) and clears the badge.
export function useMarkChatRead(clientId: string | undefined) {
  const qc = useQueryClient();
  return useCallback(async () => {
    if (!clientId) return;
    // A count that started before this call read the old read mark and would report the messages as unread again,
    // so throw away anything in flight, and set zero again once the server has confirmed.
    await qc.cancelQueries({ queryKey: unreadKey(clientId) });
    qc.setQueryData(unreadKey(clientId), 0);
    const { error } = await supabase.rpc('mark_chat_read', { p_client_id: clientId });
    if (error) qc.invalidateQueries({ queryKey: unreadKey(clientId) });
    else qc.setQueryData(unreadKey(clientId), 0);
  }, [clientId, qc]);
}

// One live connection for the whole signed-in app (mounted in the tab layout): new messages land in the cache the
// moment they are sent, and the tab badge follows. RLS still decides what this socket may see.
export function useChatRealtime(clientId: string | undefined) {
  const qc = useQueryClient();
  const markRead = useMarkChatRead(clientId);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let subscribedBefore = false;

    const resync = () => {
      qc.invalidateQueries({ queryKey: threadKey(clientId) });
      qc.invalidateQueries({ queryKey: unreadKey(clientId) });
    };

    // Subscribing before the socket has its session is a real race: the channel reports SUBSCRIBED but silently never
    // delivers changes, because the RLS check behind them has no user yet. The web app waits for the session too.
    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        .channel(`chat-${clientId}-${newLocalId().slice(0, 6)}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${clientId}` }, (payload) => {
          const row = payload.new as ChatMessageRow;
          qc.setQueryData<ChatThread | undefined>(threadKey(clientId), (p) => applyLive(p, row));
          if (row.sender_id === clientId) return; // our own message coming back
          if (chatVisible) {
            void markRead();
          } else if (qc.getQueryData<number>(unreadKey(clientId)) === undefined) {
            qc.invalidateQueries({ queryKey: unreadKey(clientId) });
          } else {
            qc.setQueryData<number>(unreadKey(clientId), (n) => (n ?? 0) + 1);
          }
        })
        .subscribe((status) => {
          if (status !== 'SUBSCRIBED') return;
          // A reconnect may have missed messages: catch up.
          if (subscribedBefore) resync();
          subscribedBefore = true;
        });
    });

    // Coming back after a while in the background: the socket may have been dropped, so catch up. A short trip away
    // (the camera, the photo picker, a permission prompt) is not worth refetching for.
    let wentToBackgroundAt: number | null = null;
    const appState = AppState.addEventListener('change', (s) => {
      if (s === 'background') {
        wentToBackgroundAt = Date.now();
      } else if (s === 'active') {
        const away = wentToBackgroundAt ? Date.now() - wentToBackgroundAt : 0;
        wentToBackgroundAt = null;
        if (away >= RESYNC_AFTER_AWAY_MS) resync();
      }
    });

    // A backstop for a socket that went deaf without reporting an error: while the app is on screen, look for anything new.
    const poll = setInterval(() => {
      if (AppState.currentState === 'active') resync();
    }, POLL_MS);

    return () => {
      cancelled = true;
      clearInterval(poll);
      appState.remove();
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientId, qc, markRead]);
}

// ---- sending ----

async function deliver(qc: QueryClient, senderId: string, localId: string) {
  const item = outboxGet(localId);
  if (!item) return;
  outboxUpdate(localId, { status: 'sending', error: undefined });
  try {
    const fields: Record<string, unknown> = { text: null };
    if (item.kind === 'text') {
      fields.text = item.text;
    } else if (item.kind === 'photo') {
      const path = item.uploadedPath ?? chatStoragePath(item.clientId, newLocalId(), 'jpg');
      if (!item.uploadedPath) {
        const shrunk = item.shrunkUri ?? (await shrinkPhoto({ uri: item.uri!, width: item.width ?? 0, height: item.height ?? 0 }));
        outboxUpdate(localId, { shrunkUri: shrunk });
        await uploadFile('chat-photos', path, shrunk, 'image/jpeg');
        outboxUpdate(localId, { uploadedPath: path });
      }
      fields.image_path = path;
    } else {
      const format = voiceNoteFormat(Platform.OS === 'web');
      const path = item.uploadedPath ?? chatStoragePath(item.clientId, newLocalId(), format.ext);
      if (!item.uploadedPath) {
        await uploadFile('voice-notes', path, item.uri!, format.contentType);
        outboxUpdate(localId, { uploadedPath: path });
      }
      fields.audio_path = path;
      fields.audio_duration_seconds = item.seconds ?? null;
    }
    const { data, error } = await supabase
      .from('chat_messages')
      .insert({ client_id: item.clientId, sender_id: senderId, ...fields })
      .select(COLUMNS)
      .single();
    if (error) throw error;
    // Swap the pending bubble for the real row in one step. If the live feed delivered it first, applyLive keeps one.
    qc.setQueryData<ChatThread | undefined>(threadKey(item.clientId), (p) => applyLive(p, data as ChatMessageRow));
    outboxRemove(localId);
  } catch (e) {
    outboxUpdate(localId, { status: 'failed', error: e instanceof Error ? e.message : 'Could not send. Check your connection.' });
  }
}

export function useChatSender(clientId: string | undefined) {
  const qc = useQueryClient();

  const queue = useCallback(
    (item: Omit<OutboxItem, 'localId' | 'clientId' | 'createdAt' | 'status'>) => {
      if (!clientId) return;
      const localId = `local-${newLocalId()}`;
      outboxAdd({ ...item, localId, clientId, createdAt: new Date().toISOString(), status: 'sending' });
      void deliver(qc, clientId, localId);
    },
    [clientId, qc],
  );

  return {
    // Returns an error message when the text can't be sent, otherwise null.
    sendText: (raw: string): string | null => {
      const n = normalizeOutgoingText(raw);
      if (!n.ok) return n.reason === 'too_long' ? 'That message is too long. Please split it up.' : null;
      queue({ kind: 'text', text: n.text });
      return null;
    },
    sendPhoto: (asset: { uri: string; width: number; height: number }) => queue({ kind: 'photo', uri: asset.uri, width: asset.width, height: asset.height }),
    sendVoice: (uri: string, seconds: number) => queue({ kind: 'voice', uri, seconds }),
    retry: (localId: string) => {
      if (clientId) void deliver(qc, clientId, localId);
    },
    discard: (localId: string) => outboxRemove(localId),
  };
}
