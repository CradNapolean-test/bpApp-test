'use client';

import { useEffect, useState } from 'react';
import { MessageSquare } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { EmptyState } from '@/app/_components/EmptyState';
import { ChatTab } from '@/app/dashboard/_components/ChatTab';
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

  async function selectClient(clientId: string) {
    setSelected(clientId);
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

  const unreadTotal = localOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <AppShell
      title="Messages"
      topBar={<CoachNav unreadCount={unreadTotal} />}
      sidebar={
        <nav className="space-y-1">
          {localOverview.map((c) => (
            <button
              key={c.client_id}
              onClick={() => selectClient(c.client_id)}
              className={`block w-full rounded-md px-3 py-2 text-left text-sm transition-colors ${
                selected === c.client_id
                  ? 'bg-accent text-accent-foreground'
                  : 'text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/5'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">{c.client_name}</span>
                {c.unread_count > 0 && (
                  <span className="flex h-4 min-w-4 shrink-0 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white">
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
        <ChatTab key={selected} clientId={selected} initialMessages={messages} currentUserId={currentUserId} />
      )}
    </AppShell>
  );
}
