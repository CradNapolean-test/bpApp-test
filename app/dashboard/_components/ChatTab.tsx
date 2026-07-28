'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { sendMessage } from '@/lib/data/chat';
import type { ChatMessageRow } from '@/lib/data/types';

export function ChatTab({
  clientId,
  initialMessages,
  currentUserId,
}: {
  clientId: string;
  initialMessages: ChatMessageRow[];
  currentUserId: string;
}) {
  const [messages, setMessages] = useState<ChatMessageRow[]>(initialMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat-${clientId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${clientId}` },
        (payload) => {
          const newMessage = payload.new as ChatMessageRow;
          setMessages((prev) => (prev.some((m) => m.id === newMessage.id) ? prev : [...prev, newMessage]));
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [clientId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    setSending(true);
    try {
      await sendMessage(clientId, text.trim());
      setText('');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[60vh] flex-col rounded-lg border border-black/10 dark:border-white/10">
      <div className="flex-1 space-y-2 overflow-y-auto p-4">
        {messages.length === 0 && <p className="text-sm text-zinc-500">No messages yet.</p>}
        {messages.map((m) => {
          const isMine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex ${isMine ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-xs rounded-lg px-3 py-2 text-sm ${
                  isMine
                    ? 'bg-foreground text-background'
                    : 'bg-black/5 text-black dark:bg-white/10 dark:text-zinc-50'
                }`}
              >
                <p>{m.text}</p>
                {/* suppressHydrationWarning: formatted in the viewer's own timezone/locale,
                    which the server can't know in advance — this text is expected to
                    differ between the SSR pass and the client, not a real mismatch. */}
                <p className="mt-1 text-[10px] opacity-60" suppressHydrationWarning>
                  {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex gap-2 border-t border-black/10 p-3 dark:border-white/10">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
