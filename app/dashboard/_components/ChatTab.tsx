'use client';

import { useEffect, useRef, useState } from 'react';
import { MessageSquare, Send } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { sendMessage } from '@/lib/data/chat';
import type { ChatMessageRow } from '@/lib/data/types';

export function ChatTab({
  clientId,
  initialMessages,
  currentUserId,
  otherPartyName = 'Them',
}: {
  clientId: string;
  initialMessages: ChatMessageRow[];
  currentUserId: string;
  // Shown on the other party's message avatars -- the client's name (coach's view) or
  // "Your coach" (client's own view), since this component doesn't otherwise know names.
  otherPartyName?: string;
}) {
  const [messages, setMessages] = useState<ChatMessageRow[]>(initialMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const toast = useToast();

  useEffect(() => {
    // Subscribing before the realtime socket's own auth handshake resolves is a real race:
    // the channel still reports SUBSCRIBED, but silently never delivers postgres_changes
    // events since the RLS check behind them has no authenticated role yet to evaluate
    // owns_client() against. Waiting for the session first avoids it.
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;

    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
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
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
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
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send message. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[75vh] flex-col rounded-2xl border border-black/10 dark:border-white/10">
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {messages.length === 0 && <EmptyState icon={MessageSquare} title="No messages yet" hint="Say hello to get the conversation started." />}
        {messages.map((m) => {
          const isMine = m.sender_id === currentUserId;
          return (
            <div key={m.id} className={`flex items-end gap-2 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
              {!isMine && <Avatar name={otherPartyName} size="sm" />}
              <div
                className={`max-w-xs rounded-2xl px-4 py-2.5 text-sm shadow-sm ${
                  isMine
                    ? 'bg-accent text-accent-foreground'
                    : 'bg-black/5 text-black dark:bg-white/10 dark:text-zinc-50'
                }`}
              >
                <p>{m.text}</p>
                {/* suppressHydrationWarning: formatted in the viewer's own timezone/locale,
                    which the server can't know in advance — this text is expected to
                    differ between the SSR pass and the client, not a real mismatch. */}
                <p className={`mt-1 text-[10px] ${isMine ? 'opacity-70' : 'opacity-60'}`} suppressHydrationWarning>
                  {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-black/10 p-3 dark:border-white/10">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message…"
          className="flex-1 rounded-full border border-black/10 bg-transparent px-4 py-2.5 text-sm dark:border-white/10"
        />
        <button
          type="submit"
          disabled={sending || !text.trim()}
          aria-label="Send"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
    </div>
  );
}
