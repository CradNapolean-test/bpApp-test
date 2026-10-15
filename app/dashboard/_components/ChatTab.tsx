'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ImageIcon, MailOpen, MessageSquare, Pause, Play, Send, UserRound, WifiOff, X } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { Avatar } from '@/app/_components/Avatar';
import { VoiceRecorder } from '@/app/_components/VoiceRecorder';
import { getEarlierMessages, getMessages, getMessagesSince, markChatRead, notifyPhotoSent, notifyVoiceSent, sendMessage } from '@/lib/data/chat';
import {
  applyIncoming,
  firstSavedAt,
  lastSavedAt,
  linkIsFresh,
  mayHaveEarlier,
  mergeMessages,
  type LocalChatMessage,
} from '@/lib/chatMessages';
import { uploadMimeType, voiceExtension } from '@/lib/voiceFormat';
import { shrinkImage } from '@/lib/utils/shrinkImage';
import { useBackHandler } from '@/app/_components/useBackHandler';
import { PhotoViewer } from '@/app/_components/Overlays';
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

// The signed link for a photo or voice note, made when its message scrolls into view (H5). Signing every attachment of a long thread
// when it opened cost one request each. The buckets' own select policies decide who may sign, so this can happen from the browser.
function useSignedUrl(bucket: 'voice-notes' | 'chat-photos', path: string, initial: string | null) {
  const holderRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(initial);
  const [failed, setFailed] = useState(false);
  // When the link in `url` was made (null while unknown: a link handed in ready-made counts as made when the bubble appeared).
  const signedAtRef = useRef<number | null>(null);
  useEffect(() => {
    if (initial && signedAtRef.current == null) signedAtRef.current = Date.now();
  }, [initial]);

  const sign = useCallback(async (): Promise<string | null> => {
    try {
      const { data } = await createClient().storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
      if (!data?.signedUrl) return null;
      signedAtRef.current = Date.now();
      return data.signedUrl;
    } catch {
      return null;
    }
  }, [bucket, path]);

  useEffect(() => {
    if (url || failed) return;
    let cancelled = false;
    const load = () => {
      void sign().then((signed) => {
        if (cancelled) return;
        if (signed) setUrl(signed);
        else setFailed(true);
      });
    };
    const el = holderRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      load();
      return () => {
        cancelled = true;
      };
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          observer.disconnect();
          load();
        }
      },
      { rootMargin: '300px' }
    );
    observer.observe(el);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [url, failed, sign]);

  return { holderRef, url, setUrl, failed, sign, signedAtRef };
}

function PhotoBubble({ path, initial, onOpen }: { path: string; initial: string | null; onOpen: (url: string) => void }) {
  const { holderRef, url, failed } = useSignedUrl('chat-photos', path, initial);
  return (
    <div ref={holderRef}>
      {url ? (
        // A button, so the keyboard and screen readers can open it (it used to be a bare clickable picture).
        <button type="button" onClick={() => onOpen(url)} aria-label="Open photo" className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={url} alt="Photo sent in chat" className="max-h-64 w-48 object-cover" />
        </button>
      ) : failed ? (
        <p className="flex items-center gap-1.5 px-3.5 py-2.5 italic opacity-70">
          <ImageIcon className="h-4 w-4" /> Photo unavailable
        </p>
      ) : (
        <div className="h-40 w-48 animate-pulse bg-black/10 dark:bg-white/10" aria-label="Loading photo" />
      )}
    </div>
  );
}

function VoiceBubble({ path, initial, seed, seconds, mine }: { path: string; initial: string | null; seed: string; seconds: number | null; mine: boolean }) {
  const { holderRef, url, setUrl, failed, sign, signedAtRef } = useSignedUrl('voice-notes', path, initial);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [trouble, setTrouble] = useState(false);
  const bars = waveHeights(seed);
  const total = seconds ?? 0;
  const mm = Math.floor(total / 60);
  const ss = String(total % 60).padStart(2, '0');

  // A link lasts ten minutes. While the note is not playing, make a fresh one before the old one runs out, so a screen left open
  // still plays when tapped (a browser only lets play() start straight from a tap, not after waiting for a new link).
  useEffect(() => {
    if (!url) return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (audio && !audio.paused) return;
      if (linkIsFresh(signedAtRef.current, Date.now())) return;
      void sign().then((fresh) => {
        if (fresh) setUrl(fresh);
      });
    }, 60_000);
    return () => window.clearInterval(timer);
  }, [url, sign, setUrl, signedAtRef]);

  async function toggle() {
    const audio = audioRef.current;
    if (!audio) return;
    setTrouble(false);
    if (!audio.paused) {
      audio.pause();
      return;
    }
    try {
      if (!url || !linkIsFresh(signedAtRef.current, Date.now())) {
        const fresh = await sign();
        if (!fresh) throw new Error('no link');
        setUrl(fresh);
        // The new link loads on the next render; the browser may not let play() start after the wait, so ask for another tap.
        setTrouble(true);
        return;
      }
      await audio.play();
    } catch {
      // play() was refused (or the note could not be loaded): stay on "play" rather than showing a pause button for a silent note.
      setPlaying(false);
      setTrouble(true);
    }
  }

  return (
    <div ref={holderRef} className="flex w-52 items-center gap-2.5">
      <audio
        ref={audioRef}
        src={url ?? undefined}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onError={() => {
          setPlaying(false);
          if (url) setTrouble(true);
        }}
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
        disabled={failed}
        onClick={() => void toggle()}
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full disabled:opacity-50 ${mine ? 'bg-black/20 text-white' : 'bg-accent text-accent-foreground'}`}
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
      <span className="text-[11px] tabular-nums opacity-70">{failed ? 'Unavailable' : trouble ? 'Tap again' : total ? `${mm}:${ss}` : ''}</span>
    </div>
  );
}

const withNoLinks = (row: ChatMessageRow): LocalChatMessage => ({ ...row, signedAudioUrl: null, signedImageUrl: null });

export function ChatTab({
  clientId,
  initialMessages,
  currentUserId,
  otherPartyName = 'Them',
  readOnly = false,
  fill = false,
  draftKey,
  active = true,
  onClose,
  memberHref,
  onMarkUnread,
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
  // Take the height of the box it sits in (the coach's docked chat) instead of sizing itself to the screen.
  fill?: boolean;
  // Remembers what is typed but not sent, per conversation, so it survives leaving the page and coming back.
  draftKey?: string;
  // False while the chat is tucked away (kept mounted so a draft and the live connection are not lost).
  active?: boolean;
  onClose?: () => void;
  // Where to open this person's page from the chat (the coach's Messages page and drawer).
  memberHref?: string;
  // Shows a "Mark unread" button in the header (the coach's inbox).
  onMarkUnread?: () => void;
}) {
  const [messages, setMessages] = useState<LocalChatMessage[]>(initialMessages);
  // A first page that came back full may have older messages behind it (H5); "Load earlier" fetches the page before the oldest shown.
  const [hasEarlier, setHasEarlier] = useState(() => mayHaveEarlier(initialMessages.length));
  const [loadingEarlier, setLoadingEarlier] = useState(false);
  // Safety net (R4): if this window is ever re-used for another conversation, start again from that conversation's messages
  // instead of keeping the previous person's thread on screen. (The coach's inbox also keys the window on the conversation.)
  const [shownClientId, setShownClientId] = useState(clientId);
  if (shownClientId !== clientId) {
    setShownClientId(clientId);
    setMessages(initialMessages);
    setHasEarlier(mayHaveEarlier(initialMessages.length));
  }
  const [text, setText] = useState(() => {
    if (!draftKey || typeof window === 'undefined') return '';
    try {
      return window.sessionStorage.getItem(`chat-draft:${draftKey}`) ?? '';
    } catch {
      return '';
    }
  });
  function changeText(value: string) {
    setText(value);
    if (!draftKey) return;
    try {
      if (value) window.sessionStorage.setItem(`chat-draft:${draftKey}`, value);
      else window.sessionStorage.removeItem(`chat-draft:${draftKey}`);
    } catch {
      // storage can be blocked; the draft still lives in memory
    }
  }
  // Photos and voice notes block the attach buttons while they upload; a text message does not (it shows at once, see handleSend).
  const [sending, setSending] = useState(false);
  const [viewingPhoto, setViewingPhoto] = useState<string | null>(null);
  // 'down' while the live connection is not delivering; messages sent meanwhile still show, and a catch-up runs when it is back (M5).
  const [connection, setConnection] = useState<'connecting' | 'live' | 'down'>('connecting');
  const listRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef(active);
  useEffect(() => {
    activeRef.current = active;
  });
  const messagesRef = useRef(messages);
  useEffect(() => {
    messagesRef.current = messages;
  });
  // Where the list was scrolled to before older messages were put above it, so the reader keeps their place.
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();
  useBackHandler(viewingPhoto != null, () => setViewingPhoto(null));

  // Fetch whatever was written after the newest message on screen: after the live connection came back, or after the page was
  // hidden and shown again (a phone that was locked stops the socket), so nothing sent in the gap is missing (M5).
  const catchUp = useCallback(async () => {
    const after = lastSavedAt(messagesRef.current);
    try {
      const fresh = after ? await getMessagesSince(clientId, after) : await getMessages(clientId);
      if (fresh.length === 0) return;
      setMessages((prev) => mergeMessages(prev, fresh));
      if (activeRef.current && fresh.some((m) => m.sender_id !== currentUserId)) markChatRead(clientId).catch(() => {});
    } catch {
      // The next catch-up (or the live connection) brings it in.
    }
  }, [clientId, currentUserId]);

  useEffect(() => {
    // Subscribing before the realtime socket's own auth handshake resolves is a real race:
    // the channel still reports SUBSCRIBED, but silently never delivers postgres_changes
    // events since the RLS check behind them has no authenticated role yet to evaluate
    // owns_client() against. Waiting for the session first avoids it.
    const supabase = createClient();
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let wasDown = false;

    supabase.auth.getSession().then(() => {
      if (cancelled) return;
      channel = supabase
        // Unique per mounted chat: the coach's Messages drawer and the member chat panel can both show the same
        // conversation, and two chats sharing one channel name throws.
        .channel(`chat-${clientId}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `client_id=eq.${clientId}` },
          (payload) => {
            const row = payload.new as ChatMessageRow;
            // The row is raw: no signed link. The message signs its own attachment when it scrolls into view.
            setMessages((prev) => applyIncoming(prev, withNoLinks(row)));
            // Looking at the conversation as it arrives: it is read.
            if (activeRef.current && row.sender_id !== currentUserId) markChatRead(clientId).catch(() => {});
          }
        )
        .subscribe((status) => {
          if (cancelled) return;
          if (status === 'SUBSCRIBED') {
            setConnection('live');
            if (wasDown) {
              wasDown = false;
              void catchUp();
            }
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            wasDown = true;
            setConnection('down');
          }
        });
    });

    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [clientId, currentUserId, catchUp]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible') void catchUp();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [catchUp]);

  // Older messages arriving above keep the reader where they were...
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const list = listRef.current;
    if (!anchor || !list) return;
    list.scrollTop = anchor.top + (list.scrollHeight - anchor.height);
    anchorRef.current = null;
  }, [messages]);

  // ...and only a new newest message (or one of your own waiting to send) scrolls to the bottom.
  const newestKey = messages.at(-1)?.id ?? '';
  useEffect(() => {
    // Scroll just the message list (scrollIntoView would also scroll the whole page).
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' });
  }, [newestKey]);

  useEffect(() => {
    // Viewing the thread marks it read -- best-effort, a failure here just means the badge
    // doesn't clear this time rather than blocking anything the user is doing.
    if (!active) return;
    markChatRead(clientId).catch(() => {});
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [clientId, active]);

  async function loadEarlier() {
    const before = firstSavedAt(messages);
    if (!before || loadingEarlier) return;
    setLoadingEarlier(true);
    const list = listRef.current;
    try {
      const page = await getEarlierMessages(clientId, before);
      if (list) anchorRef.current = { height: list.scrollHeight, top: list.scrollTop };
      setMessages((prev) => mergeMessages(prev, page.messages));
      setHasEarlier(page.hasMore);
    } catch {
      toast.error('Could not load earlier messages. Please try again.');
    } finally {
      setLoadingEarlier(false);
    }
  }

  // The message shows straight away, marked "Sending…", and is swapped for the saved one when it comes back. If it cannot be saved it
  // stays, marked "Not sent", with a way to try again; it used to vanish until the live connection delivered it, so a sender with
  // the connection down saw nothing and sent it twice (M5).
  async function deliver(tempId: string, body: string) {
    try {
      const saved = await sendMessage(clientId, body);
      setMessages((prev) => mergeMessages(prev.filter((m) => m.id !== tempId), [saved]));
    } catch {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? { ...m, pending: 'failed' } : m)));
      toast.error('Message not sent. Use "Try again" under it.');
    }
  }

  function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    const tempId = `pending-${crypto.randomUUID()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: tempId,
        client_id: clientId,
        sender_id: currentUserId,
        text: body,
        audio_path: null,
        audio_duration_seconds: null,
        image_path: null,
        created_at: new Date().toISOString(),
        signedAudioUrl: null,
        signedImageUrl: null,
        pending: 'sending',
      },
    ]);
    changeText('');
    void deliver(tempId, body);
  }

  function retry(m: LocalChatMessage) {
    if (m.text == null) return;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, pending: 'sending' } : x)));
    void deliver(m.id, m.text);
  }

  function discard(m: LocalChatMessage) {
    setMessages((prev) => prev.filter((x) => x.id !== m.id));
    if (!text.trim() && m.text) changeText(m.text);
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
      const { data: row, error } = await supabase
        .from('chat_messages')
        .insert({ client_id: clientId, sender_id: currentUserId, text: null, image_path: path })
        .select('*')
        .single();
      if (error) throw error;
      setMessages((prev) => applyIncoming(prev, withNoLinks(row as ChatMessageRow)));
      void notifyPhotoSent(clientId);
    } catch {
      toast.error('Could not send that photo. Please try again.');
    } finally {
      setSending(false);
      input.value = '';
    }
  }

  // From the browser straight to storage and into the thread, like photos: the recording used to travel through a server action, which
  // is capped at 4 MB (M4). The file keeps the type it was really recorded in.
  async function handleVoiceNote(blob: Blob, durationSeconds: number) {
    setSending(true);
    try {
      const type = uploadMimeType(blob.type, null);
      const path = `${clientId}/${crypto.randomUUID()}.${voiceExtension(type)}`;
      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from('voice-notes').upload(path, blob, { contentType: type });
      if (uploadError) throw uploadError;
      const { data: row, error } = await supabase
        .from('chat_messages')
        .insert({ client_id: clientId, sender_id: currentUserId, text: null, audio_path: path, audio_duration_seconds: durationSeconds })
        .select('*')
        .single();
      if (error) throw error;
      setMessages((prev) => applyIncoming(prev, withNoLinks(row as ChatMessageRow)));
      void notifyVoiceSent(clientId);
    } catch {
      toast.error('Could not send voice note. Please try again.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      className={`flex flex-col overflow-hidden rounded-2xl border border-black/[.05] bg-card shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10 ${
        fill ? 'h-full min-h-0' : 'h-[calc(100dvh-10.5rem-env(safe-area-inset-bottom))] min-h-[420px]'
      }`}
    >
      <div className="flex items-center gap-3 border-b border-black/[.05] px-4 py-3 dark:border-white/10">
        <Avatar name={otherPartyName} size="md" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold text-black dark:text-zinc-50">{otherPartyName}</p>
          <p className="text-[11px] text-zinc-500">{readOnly ? 'Read-only' : 'Messages, photos and voice notes'}</p>
        </div>
        {onMarkUnread && (
          <button
            type="button"
            onClick={onMarkUnread}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-black/5 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
          >
            <MailOpen className="h-3.5 w-3.5" /> Mark unread
          </button>
        )}
        {memberHref && (
          <Link
            href={memberHref}
            className="flex shrink-0 items-center gap-1.5 rounded-full border border-black/10 px-3 py-1.5 text-xs font-bold text-accent hover:bg-accent/10 dark:border-white/15"
          >
            <UserRound className="h-3.5 w-3.5" /> View member
          </Link>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Hide chat"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      <div ref={listRef} className="flex-1 space-y-2.5 overflow-y-auto overscroll-contain px-3.5 py-4">
        {hasEarlier && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => void loadEarlier()}
              disabled={loadingEarlier}
              className="rounded-full border border-black/10 px-3.5 py-1.5 text-xs font-bold text-zinc-600 hover:bg-black/5 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300 dark:hover:bg-white/5"
            >
              {loadingEarlier ? 'Loading…' : 'Load earlier messages'}
            </button>
          </div>
        )}
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
                    className={`overflow-hidden text-sm leading-relaxed ${m.image_path ? 'p-0' : 'px-3.5 py-2.5'} ${m.pending ? 'opacity-70' : ''} ${
                      isMine
                        ? 'rounded-[16px_4px_16px_16px] bg-accent text-accent-foreground'
                        : 'rounded-[4px_16px_16px_16px] border border-black/[.05] bg-black/5 text-black dark:border-white/10 dark:bg-white/10 dark:text-zinc-50'
                    }`}
                  >
                    {m.image_path ? (
                      <PhotoBubble path={m.image_path} initial={m.signedImageUrl ?? null} onOpen={setViewingPhoto} />
                    ) : m.audio_path ? (
                      <VoiceBubble path={m.audio_path} initial={m.signedAudioUrl} seed={m.id} seconds={m.audio_duration_seconds} mine={isMine} />
                    ) : (
                      <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    )}
                  </div>
                  {m.pending === 'failed' ? (
                    <p className="mt-0.5 flex items-center gap-2 px-1 text-[11px] font-medium text-danger" role="status">
                      Not sent
                      <button type="button" onClick={() => retry(m)} className="font-bold underline">
                        Try again
                      </button>
                      <button type="button" onClick={() => discard(m)} className="font-bold underline">
                        Delete
                      </button>
                    </p>
                  ) : m.pending === 'sending' ? (
                    <p className="mt-0.5 px-1 text-[10px] text-zinc-400">Sending…</p>
                  ) : (
                    /* suppressHydrationWarning: formatted in the viewer's own timezone, which the
                       server can't know -- expected to differ between SSR and client. */
                    <p className="mt-0.5 px-1 text-[10px] text-zinc-400" suppressHydrationWarning>
                      {timeLabel(m.created_at)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {connection === 'down' && (
        <p role="status" className="flex items-center justify-center gap-1.5 border-t border-black/[.05] bg-warning/10 px-3 py-1.5 text-xs font-medium text-warning dark:border-white/10">
          <WifiOff className="h-3.5 w-3.5" /> Reconnecting… new messages will appear when you are back online.
        </p>
      )}
      {!readOnly && (
        <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-black/[.05] p-2.5 dark:border-white/10">
          <div className="flex min-w-0 flex-1 items-center gap-1 rounded-full border border-black/[.08] bg-black/[.02] pl-1.5 pr-1 dark:border-white/10 dark:bg-white/[.03]">
            <button
              type="button"
              aria-label="Attach a photo"
              disabled={sending}
              onClick={() => photoInputRef.current?.click()}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-zinc-500 disabled:opacity-50"
            >
              <ImageIcon className="h-[18px] w-[18px]" />
            </button>
            <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhoto} />
            <input
              type="text"
              maxLength={4000}
              value={text}
              onChange={(e) => changeText(e.target.value)}
              placeholder={`Message ${otherPartyName}…`}
              className="min-w-0 flex-1 bg-transparent py-2.5 text-base outline-none placeholder:text-zinc-400 sm:text-sm"
            />
            <VoiceRecorder onRecorded={handleVoiceNote} disabled={sending} />
          </div>
          <button
            type="submit"
            disabled={!text.trim()}
            aria-label="Send"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-sm disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
          </button>
        </form>
      )}
      {viewingPhoto && (
        <PhotoViewer label="Photo sent in chat" onClose={() => setViewingPhoto(null)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={viewingPhoto} alt="Photo sent in chat" className="max-h-[85vh] max-w-full rounded-xl object-contain" />
        </PhotoViewer>
      )}
    </div>
  );
}
