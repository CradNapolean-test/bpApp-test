'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
import { createClient } from '@/lib/supabase/client';
import { getMessages, markChatRead } from '@/lib/data/chat';
import type { ChatMessageRow, ChatOverviewRow } from '@/lib/data/types';

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function MessagesHubShell({
  overview,
  currentUserId,
}: {
  overview: ChatOverviewRow[];
  currentUserId: string;
}) {
  const [localOverview, setLocalOverview] = useState(overview);
  const [selected, setSelected] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  // Mirrors `selected` for the once-only realtime subscription below, whose closure would
  // otherwise see a stale value.
  const selectedRef = useRef<string | null>(null);

  async function selectClient(clientId: string) {
    setSelected(clientId);
    selectedRef.current = clientId;
    setMessages([]);
    setLoading(true);
    const [msgs] = await Promise.all([getMessages(clientId), markChatRead(clientId)]);
    setMessages(msgs);
    setLocalOverview((prev) => prev.map((c) => (c.client_id === clientId ? { ...c, unread_count: 0 } : c)));
    setLoading(false);
  }

  useEffect(() => {
    // Only run once, on mount -- selecting a different client afterwards is user-driven,
    // via the onClick handlers below, not this effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount pattern
    if (overview[0]) selectClient(overview[0].client_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // One filtered channel per client rather than a single unfiltered one -- verified directly
    // (disposable two-coach test accounts, admin-bypassing inserts) that an unfiltered
    // postgres_changes subscription on chat_messages never delivers events in this project,
    // while a per-client `client_id=eq.X` filter (matching ChatTab's own subscription) reliably
    // does. Also verified: subscribing before `supabase.auth.getSession()` resolves races the
    // realtime socket's auth handshake -- the subscription reports SUBSCRIBED either way, but
    // silently never delivers events if it wins that race, since the RLS check behind
    // postgres_changes has no authenticated role to evaluate `owns_client()` against yet.
    // Waiting for the session first, as done here, avoids that.
    const supabase = createClient();
    let cancelled = false;
    let channels: ReturnType<typeof supabase.channel>[] = [];

    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channels = overview.map((c) =>
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
                        last_message: message.text,
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
  }, [currentUserId]);

  const unreadTotal = localOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const selectedClient = localOverview.find((c) => c.client_id === selected);

  return (
    <AppShell
      title="Messages"
      topBar={<CoachNav unreadCount={unreadTotal} />}
      sidebar={
        <nav className="space-y-1.5">
          {localOverview.map((c) => (
            <button
              key={c.client_id}
              onClick={() => selectClient(c.client_id)}
              className={`block w-full rounded-2xl px-3 py-2.5 text-left text-sm transition-colors ${
                selected === c.client_id
                  ? 'bg-accent text-accent-foreground shadow-sm'
                  : 'text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Avatar name={c.client_name} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-medium">{c.client_name}</span>
                    {c.unread_count > 0 && (
                      <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-danger px-1.5 text-[10px] font-semibold text-white">
                        {c.unread_count > 99 ? '99+' : c.unread_count}
                      </span>
                    )}
                  </div>
                  {c.last_message ? (
                    <p className={`truncate text-xs ${selected === c.client_id ? 'opacity-80' : 'text-zinc-500'}`}>
                      {c.last_message}
                      {c.last_message_at && ` · ${relativeTime(c.last_message_at)}`}
                    </p>
                  ) : (
                    <p className={`text-xs ${selected === c.client_id ? 'opacity-80' : 'text-zinc-500'}`}>No messages yet</p>
                  )}
                </div>
              </div>
            </button>
          ))}
          {localOverview.length === 0 && <EmptyState compact title="No clients yet" />}
        </nav>
      }
    >
      {!selected ? (
        <EmptyState
          icon={MessageSquare}
          title="No conversations yet"
          hint="Once you have clients, their threads will show up here."
        />
      ) : loading ? (
        <p className="text-sm text-zinc-500">Loading messages…</p>
      ) : (
        <ChatTab
          key={selected}
          clientId={selected}
          initialMessages={messages}
          currentUserId={currentUserId}
          otherPartyName={selectedClient?.client_name ?? 'Client'}
        />
      )}
    </AppShell>
  );
}
