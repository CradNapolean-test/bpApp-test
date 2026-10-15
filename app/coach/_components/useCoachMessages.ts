'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getCoachChatOverview, getMessages, markChatRead, markChatUnread } from '@/lib/data/chat';
import { createLatestOnly } from '@/lib/latestOnly';
import { mergeOverview, pickChannelClients, sortOverview } from '@/lib/inboxOverview';
import type { ChatMessage, ChatMessageRow, ChatOverviewRow } from '@/lib/data/types';

// How often the conversation list is fetched again while the page is open, and how many conversations get a live connection.
// Supabase limits how many realtime channels one connection can hold (about 100): the most recent conversations are live, the
// rest (and any member's first ever message, which has no connection yet) arrive through the refetch.
const REFRESH_EVERY_MS = 60_000;
const MAX_LIVE_CONVERSATIONS = 40;

let channelRun = 0;

// Extracted from MessagesHubShell.tsx so the same selected-thread/realtime logic can back
// both the full /coach/messages page and the MessagesDrawer overlay, without duplicating the
// two gotchas already solved here: an unfiltered postgres_changes subscription never delivers
// events in this project (verified with disposable two-coach test accounts, admin-bypassing
// inserts), and subscribing before auth.getSession() resolves can lose the race against the
// realtime socket's auth handshake.
export function useCoachMessages(initialOverview: ChatOverviewRow[], currentUserId: string) {
  const [localOverview, setLocalOverview] = useState(initialOverview);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // Changes each time a thread's messages arrive, so a chat window can be keyed on the conversation AND the load it was filled by.
  const [loadId, setLoadId] = useState(0);
  const selectedRef = useRef<string | null>(null);
  // Only the latest request wins (R4): the first click's answer arrives after the second click's and must not be shown.
  const [guard] = useState(createLatestOnly);

  async function selectClient(clientId: string) {
    const ticket = guard.next();
    setSelected(clientId);
    selectedRef.current = clientId;
    setMessages([]);
    setLoadError(false);
    setLoading(true);
    let msgs: ChatMessage[];
    try {
      msgs = await getMessages(clientId);
    } catch {
      if (guard.isCurrent(ticket)) {
        setLoadError(true);
        setLoading(false);
      }
      return;
    }
    if (!guard.isCurrent(ticket)) return;
    setMessages(msgs);
    setLoadId(ticket);
    setLocalOverview((prev) => prev.map((c) => (c.client_id === clientId ? { ...c, unread_count: 0 } : c)));
    setLoading(false);
  }

  // Mark a conversation read or unread from the list. Shown straight away; the save follows. Marking one unread
  // while it is the open thread closes the thread, so it is not both open and unread.
  function markRead(clientId: string) {
    setLocalOverview((prev) => prev.map((c) => (c.client_id === clientId ? { ...c, unread_count: 0 } : c)));
    markChatRead(clientId).catch(() => {});
  }

  function markUnread(clientId: string) {
    setLocalOverview((prev) => prev.map((c) => (c.client_id === clientId && c.last_message_at ? { ...c, unread_count: Math.max(1, c.unread_count) } : c)));
    markChatUnread(clientId).catch(() => {});
    if (selectedRef.current === clientId) clearSelection();
  }

  function clearSelection() {
    guard.next(); // anything still loading for the thread that was open is no longer wanted
    setSelected(null);
    selectedRef.current = null;
    setMessages([]);
    setLoadError(false);
    setLoading(false);
  }

  function retryLoad() {
    if (selectedRef.current) void selectClient(selectedRef.current);
  }

  useEffect(() => {
    // Reacting to an external prop signal (MessagesDrawer fetches its overview asynchronously
    // and passes it in once available), not synchronizing with an external system -- the
    // established exception to this rule elsewhere in the app (see WorkoutTab.tsx's focusDay
    // effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOverview(initialOverview);
  }, [initialOverview]);

  // Fetch the list again when the tab regains focus and every minute while the page is open, merged into what is on screen, so a
  // member's first ever message (no live connection yet) and anything missed while a connection dropped still show up (R29).
  const refreshOverview = useCallback(async () => {
    try {
      const fresh = await getCoachChatOverview();
      setLocalOverview((prev) => mergeOverview(prev, fresh, selectedRef.current));
    } catch {
      // Keep what is on screen; the next refresh tries again.
    }
  }, []);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState === 'visible') void refreshOverview();
    };
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);
    const timer = window.setInterval(refreshIfVisible, REFRESH_EVERY_MS);
    return () => {
      window.removeEventListener('focus', refreshIfVisible);
      document.removeEventListener('visibilitychange', refreshIfVisible);
      window.clearInterval(timer);
    };
  }, [refreshOverview]);

  // The conversations that get a live connection: the most recent ones, plus the open one. A string key (not the array) so that a
  // message moving a conversation up the list does not tear every connection down and up again.
  const liveKey = useMemo(() => pickChannelClients(localOverview, selected, MAX_LIVE_CONVERSATIONS).join(','), [localOverview, selected]);

  useEffect(() => {
    if (!liveKey) return;
    const clientIds = liveKey.split(',');
    const supabase = createClient();
    let cancelled = false;
    let channels: ReturnType<typeof supabase.channel>[] = [];

    // One connection per conversation that has a real message: opening one per client regardless doesn't scale at roster size.
    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      // A new name every time the set changes: removing a channel is asynchronous, and re-adding the same topic straight away
      // throws ("cannot add postgres_changes callbacks ... after subscribe()").
      const run = ++channelRun;
      channels = clientIds.map((clientId) =>
        supabase
          .channel(`coach-inbox-${clientId}-${run}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${clientId}` },
            (payload) => {
              const message = payload.new as ChatMessageRow;
              const isOpenThread = message.client_id === selectedRef.current;
              setLocalOverview((prev) =>
                sortOverview(
                  prev.map((row) =>
                    row.client_id === message.client_id
                      ? {
                          ...row,
                          last_message: message.text ?? (message.audio_path ? '🎤 Voice note' : message.image_path ? '📷 Photo' : null),
                          last_message_at: message.created_at,
                          last_sender_id: message.sender_id,
                          unread_count:
                            isOpenThread || message.sender_id === currentUserId ? row.unread_count : row.unread_count + 1,
                        }
                      : row
                  )
                )
              );
            }
          )
          .subscribe()
      );
    });

    return () => {
      cancelled = true;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
  }, [currentUserId, liveKey]);

  const unreadTotal = localOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const selectedClient = localOverview.find((c) => c.client_id === selected);

  return {
    localOverview,
    selected,
    selectClient,
    clearSelection,
    markRead,
    markUnread,
    messages,
    loading,
    loadError,
    loadId,
    retryLoad,
    refreshOverview,
    unreadTotal,
    selectedClient,
  };
}
