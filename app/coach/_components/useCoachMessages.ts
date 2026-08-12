'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { getMessages } from '@/lib/data/chat';
import type { ChatMessage, ChatMessageRow, ChatOverviewRow } from '@/lib/data/types';

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
  const selectedRef = useRef<string | null>(null);

  async function selectClient(clientId: string) {
    setSelected(clientId);
    selectedRef.current = clientId;
    setMessages([]);
    setLoading(true);
    const msgs = await getMessages(clientId);
    setMessages(msgs);
    setLocalOverview((prev) => prev.map((c) => (c.client_id === clientId ? { ...c, unread_count: 0 } : c)));
    setLoading(false);
  }

  function clearSelection() {
    setSelected(null);
    selectedRef.current = null;
    setMessages([]);
  }

  useEffect(() => {
    // Reacting to an external prop signal (MessagesDrawer fetches its overview asynchronously
    // and passes it in once available), not synchronizing with an external system -- the
    // established exception to this rule elsewhere in the app (see WorkoutTab.tsx's focusDay
    // effect).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocalOverview(initialOverview);
  }, [initialOverview]);

  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;
    let channels: ReturnType<typeof supabase.channel>[] = [];

    // Only subscribe to clients with a real conversation -- at roster scale (100+ clients),
    // opening one websocket channel per client regardless of whether they've ever messaged
    // doesn't scale. A client who starts a new thread shows up here once useCoachMessages'
    // own initialOverview-sync effect (above) picks up their first message via a subsequent
    // fetch, same as it already does for any other overview change.
    const activeOverview = localOverview.filter((c) => c.last_message_at != null);

    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channels = activeOverview.map((c) =>
        supabase
          .channel(`coach-inbox-${c.client_id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${c.client_id}` },
            (payload) => {
              const message = payload.new as ChatMessageRow;
              const isOpenThread = message.client_id === selectedRef.current;
              setLocalOverview((prev) => {
                const next = prev.map((row) =>
                  row.client_id === message.client_id
                    ? {
                        ...row,
                        last_message: message.text ?? (message.audio_path ? '🎤 Voice note' : null),
                        last_message_at: message.created_at,
                        last_sender_id: message.sender_id,
                        unread_count:
                          isOpenThread || message.sender_id === currentUserId ? row.unread_count : row.unread_count + 1,
                      }
                    : row
                );
                return next.sort((a, b) => {
                  if (!a.last_message_at) return 1;
                  if (!b.last_message_at) return -1;
                  return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
                });
              });
            }
          )
          .subscribe()
      );
    });

    return () => {
      cancelled = true;
      channels.forEach((channel) => supabase.removeChannel(channel));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserId, initialOverview]);

  const unreadTotal = localOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const selectedClient = localOverview.find((c) => c.client_id === selected);

  return { localOverview, selected, selectClient, clearSelection, messages, loading, unreadTotal, selectedClient };
}
