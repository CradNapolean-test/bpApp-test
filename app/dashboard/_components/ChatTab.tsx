'use client';

import { useEffect, useRef, useState } from 'react';
import { ImageIcon, MessageSquare, Pause, Play, Send, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { VoiceRecorder } from '@/app/_components/VoiceRecorder';
import { markChatRead, notifyPhotoSent, sendMessage, sendVoiceNote } from '@/lib/data/chat';
import { shrinkImage } from '@/lib/utils/shrinkImage';
import type { ChatMessage, ChatMessageRow } from '@/lib/data/types';

const SIGNED_URL_TTL_SECONDS = 60 * 10;
function dayLabel(iso: string): string {
  const d = new Date(iso);
  const key = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const now = new Date();
  const yesterday = new Date(now.getTime() - 86400000);
  if (key(d) === key(now)) return 'Today';
  if (key(d) === key(yesterday)) return 'Yesterday';
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '');
}

// Stable pseudo-random bar heights per message so a voice note always draws the same shape.
function waveHeights(seed: string): number[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return Array.from({ length: 24 }, () => {
    h = (h * 1664525 + 1013904223) >>> 0;
    return 5 + (h % 14);
  });
}

function VoiceBubble({ src, seed, seconds, mine }: { src: string; seed: string; seconds: number | null; mine: boolean }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const bars = waveHeights(seed);
  const total = seconds ?? 0;
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');
  return (
    <div className="flex w-52 items-center gap-2.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onEnded={() => {
          setPlaying(false);
          setProgress(0);
        }}
        onTimeUpdate={(e) => {
          const a = e.currentTarget;
          if (a.duration) setProgress(a.currentTime / a.duration);
        }}
      />
      <button
        type="button"
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        onClick={() => {
          const a = audioRef.current;
          if (!a) return;
          if (playing) {
            a.pause();
            setPlaying(false);
          } else {
            void a.play();
            setPlaying(true);
          }
        }}
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${mine ? 'bg-black/20 text-white' : 'bg-accent text-accent-foreground'}`}
      >
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </button>
      <div className="flex h-6 flex-1 items-center gap-[2px]">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${
              i / bars.length < progress ? (mine ? 'bg-white' : 'bg-accent') : mine ? 'bg-black/25' : 'bg-black/15 dark:bg-white/25'
            }`}
            style={{ height: h }}
          />
        ))}
      </div>
      <span className="text-[11px] tabular-nums opacity-70">{total ? `${mm}:${ss}` : ''}</span>
    </div>
  );
}

export function ChatTab({
  clientId,
  initialMessages,
  currentUserId,
  otherPartyName = 'Them',
  readOnly = false,
}: {
  clientId: string;
  initialMessages: ChatMessage[];
  currentUserId: string;
  // Shown on the other party's message avatars -- the client's name (coach's view) or
  // "Your coach" (client's own view), since this component doesn't otherwise know names.
  otherPartyName?: string;
  // Hides the composer -- a coach viewing a colleague's client read-only can still see the
  // thread, but sendMessage would fail RLS (owns_client) anyway since they aren't the
  // assigned coach.
  readOnly?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
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
          async (payload) => {
            const row = payload.new as ChatMessageRow;
            // A postgres_changes payload is the raw row -- no signed URL. The buckets' own select
            // RLS policies (owns_client) already gate who can call this, so it can happen straight
            // from the browser client with no extra server round-trip.
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
            if (cancelled) return;
            const newMessage: ChatMessage = { ...row, signedAudioUrl, signedImageUrl };
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

  useEffect(() => {
    // Viewing the thread marks it read -- best-effort, a failure here just means the badge
    // doesn't clear this time rather than blocking anything the user is doing.
    markChatRead(clientId).catch(() => {});
  }, [clientId]);

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

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const input = e.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setSending(true);
    try {
      const blob = await shrinkImage(file);
      const supabase = createClient();
      const path = `${clientId}/${crypto.randomUUID()}.jpg`;
      const { error: uploadError } = await supabase.storage.from('chat-photos').upload(path, blob, { contentType: 'image/jpeg' });
      if (uploadError) throw uploadError;
      const { error } = await supabase
        .from('chat_messages')
        .insert({ client_id: clientId, sender_id: currentUserId, text: null, image_path: path });
      if (error) throw error;
      void notifyPhotoSent(clientId);
    } catch {
      toast.error('Could not send that photo. Please try again.');
    } finally {
      setSending(false);
      input.value = '';
    }
  }

  async function handleVoiceNote(blob: Blob, durationSeconds: number) {
    setSending(true);
    try {
      const formData = new FormData();
      formData.set('file', blob, 'voice-note.webm');
      formData.set('duration', String(durationSeconds));
      await sendVoiceNote(clientId, formData);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send voice note. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-10.5rem)] min-h-[420px] flex-col overflow-hidden rounded-2xl border border-black/[.05] bg-card shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
      <div className="flex items-center gap-3 border-b border-black/[.05] px-4 py-3 dark:border-white/10">
        <Avatar name={otherPartyName} size="md" />
        <div>
          <p className="text-sm font-extrabold text-black dark:text-zinc-50">{otherPartyName}</p>
          <p className="text-[11px] text-zinc-500">{readOnly ? 'Read-only' : 'Messages, photos and voice notes'}</p>
        </div>
      </div>
      <div className="flex-1 space-y-2.5 overflow-y-auto px-3.5 py-4">
        {messages.length === 0 && (
          <EmptyState icon={MessageSquare} title="No messages yet" hint="Say hello to get the conversation started." />
        )}
        {messages.map((m, i) => {
          const isMine = m.sender_id === currentUserId;
          const showDay = i === 0 || dayLabel(messages[i - 1].created_at) !== dayLabel(m.created_at);
          return (
            <div key={m.id}>
              {showDay && (
                <p className="my-3 text-center text-[10px] font-bold uppercase tracking-wider text-zinc-400" suppressHydrationWarning>
                  {dayLabel(m.created_at)}
                </p>
              )}
              <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                {!isMine && <Avatar name={otherPartyName} size="sm" />}
                <div className={`flex max-w-[78%] flex-col ${isMine ? 'items-end' : 'items-start'}`}>
                  <div
                    className={`overflow-hidden text-sm leading-relaxed ${m.image_path ? 'p-0' : 'px-3.5 py-2.5'} ${
                      isMine
                        ? 'rounded-[16px_4px_16px_16px] bg-accent text-accent-foreground'
                        : 'rounded-[4px_16px_16px_16px] border border-black/[.05] bg-black/5 text-black dark:border-white/10 dark:bg-white/10 dark:text-zinc-50'
                    }`}
                  >
                    {m.image_path ? (
                      m.signedImageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={m.signedImageUrl}
                          alt="Photo sent in chat"
                          onClick={() => setViewingPhoto(m.signedImageUrl ?? null)}
                          className="max-h-64 w-48 cursor-pointer object-cover"
                        />
                      ) : (
                        <p className="flex items-center gap-1.5 px-3.5 py-2.5 italic opacity-70">
                          <ImageIcon className="h-4 w-4" /> Photo unavailable
                        </p>
                      )
                    ) : m.audio_path ? (
                      m.signedAudioUrl ? (
                        <VoiceBubble src={m.signedAudioUrl} seed={m.id} seconds={m.audio_duration_seconds} mine={isMine} />
                      ) : (
                        <p className="italic opacity-70">Voice note unavailable</p>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    )}
                  </div>
                  {/* suppressHydrationWarning: formatted in the viewer's own timezone, which the
                      server can't know -- expected to differ between SSR and client. */}
                  <p className="mt-0.5 px-1 text-[10px] text-zinc-400" suppressHydrationWarning>
                    {timeLabel(m.created_at)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
      {!readOnly && (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-black/[.05] p-2.5 dark:border-white/10">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-black/[.08] bg-black/[.02] pl-1.5 pr-1 dark:border-white/10 dark:bg-white/[.03]">
            <button
              type="button"
              aria-label="Attach a photo"
              disabled={sending}
              onClick={() => photoInputRef.current?.click()}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-zinc-500 disabled:opacity-50"
            >
              <ImageIcon className="h-[18px] w-[18px]" />
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            <input
              type="text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={`Message ${otherPartyName}…`}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-zinc-400 sm:text-sm"
            />
            <VoiceRecorder onRecorded={handleVoiceNote} disabled={sending} />
          </div>
          <button
            type="submit"
            disabled={sending || !text.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
      {viewingPhoto && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-4" onClick={() => setViewingPhoto(null)}>
          <button type="button" aria-label="Close photo" className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white">
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewingPhoto} alt="Photo sent in chat" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
        </div>
      )}
    </div>
  );
}
