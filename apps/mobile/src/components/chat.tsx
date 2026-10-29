import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Image } from 'expo-image';
import { memo, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Platform, TextInput, View, type TextInputKeyPressEvent } from 'react-native';

import type { ChatMessageRow } from '@ballistic/shared/data/types';
import {
  VOICE_NOTE_MAX_SECONDS,
  VOICE_NOTE_MIN_SECONDS,
  formatDuration,
  messageKind,
  timeLabel,
  waveHeights,
} from '@ballistic/shared/utils/chat';

import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { PhotoSourceMenu } from '@/components/media';
import { AppText } from '@/components/ui';
import type { OutboxItem } from '@/lib/chatOutbox';
import { PhotoPermissionError, pickPhoto, useSignedUrl } from '@/lib/media';
import { spacing, useTheme } from '@/theme';

const PHOTO_W = 200;
const PHOTO_H = 240;

export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const t = useTheme();
  const initial = (name.trim()[0] ?? '?').toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
      <AppText style={{ color: t.accentStrong, fontWeight: '800', fontSize: size * 0.42 }}>{initial}</AppText>
    </View>
  );
}

// ---- voice notes ----

// Only one voice note plays at a time, and a player is only created once someone presses play (a long chat history
// must not hold dozens of audio players).
let activeVoiceId: string | null = null;
const voiceListeners = new Set<() => void>();
function setActiveVoice(id: string | null) {
  activeVoiceId = id;
  voiceListeners.forEach((l) => l());
}
function useActiveVoice() {
  return useSyncExternalStore(
    (l) => {
      voiceListeners.add(l);
      return () => voiceListeners.delete(l);
    },
    () => activeVoiceId,
    () => activeVoiceId,
  );
}

function VoiceShell({ id, mine, label, progress, playing, loading, onPress }: { id: string; mine: boolean; label: string; progress: number; playing: boolean; loading?: boolean; onPress: () => void }) {
  const t = useTheme();
  const bars = useMemo(() => waveHeights(id), [id]);
  const fg = mine ? t.accentForeground : t.foreground;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, width: 210 }}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause voice note' : 'Play voice note'}
        style={{ width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: mine ? 'rgba(0,0,0,0.2)' : t.accent }}>
        {loading ? <ActivityIndicator size="small" color={t.accentForeground} /> : <Icon name={playing ? 'pause' : 'play'} size={15} color={t.accentForeground} fill={t.accentForeground} />}
      </Pressable>
      <View style={{ flex: 1, height: 24, flexDirection: 'row', alignItems: 'center', gap: 2 }}>
        {bars.map((h, i) => (
          <View key={i} style={{ width: 3, height: h, borderRadius: 2, backgroundColor: i / bars.length < progress ? (mine ? t.accentForeground : t.accent) : mine ? 'rgba(0,0,0,0.25)' : t.border }} />
        ))}
      </View>
      <AppText variant="small" style={{ color: fg, opacity: 0.7, fontSize: 11 }}>{label}</AppText>
    </View>
  );
}

function ActiveVoice({ id, path, seconds, mine }: { id: string; path: string; seconds: number | null; mine: boolean }) {
  const t = useTheme();
  const url = useSignedUrl('voice-notes', path);
  if (url.isError) return <AppText style={{ fontStyle: 'italic', color: mine ? t.accentForeground : t.foreground, opacity: 0.7 }}>Voice note unavailable</AppText>;
  if (!url.data) return <VoiceShell id={id} mine={mine} label={formatDuration(seconds)} progress={0} playing={false} loading onPress={() => setActiveVoice(null)} />;
  return <VoicePlayer key={url.data} id={id} url={url.data} seconds={seconds} mine={mine} />;
}

function VoicePlayer({ id, url, seconds, mine }: { id: string; url: string; seconds: number | null; mine: boolean }) {
  const player = useAudioPlayer(url);
  const status = useAudioPlayerStatus(player);
  const started = useRef(false);

  useEffect(() => {
    if (status.isLoaded && !started.current) {
      started.current = true;
      player.play();
    }
  }, [status.isLoaded, player]);

  useEffect(() => {
    if (status.didJustFinish) setActiveVoice(null);
  }, [status.didJustFinish]);

  // A browser-recorded (webm) file can report no length, so fall back to the length saved with the message.
  const total = status.duration && Number.isFinite(status.duration) && status.duration > 0 ? status.duration : seconds ?? 0;
  const progress = total ? Math.min(1, status.currentTime / total) : 0;
  return (
    <VoiceShell
      id={id}
      mine={mine}
      label={formatDuration(status.playing ? status.currentTime : total)}
      progress={progress}
      playing={status.playing}
      loading={!status.isLoaded}
      onPress={() => (status.playing ? player.pause() : player.play())}
    />
  );
}

function VoiceBubble({ id, path, seconds, mine }: { id: string; path: string; seconds: number | null; mine: boolean }) {
  const active = useActiveVoice() === id;
  if (!active) return <VoiceShell id={id} mine={mine} label={formatDuration(seconds)} progress={0} playing={false} onPress={() => setActiveVoice(id)} />;
  return <ActiveVoice id={id} path={path} seconds={seconds} mine={mine} />;
}

// ---- photos ----

function PhotoBubble({ path, localUri, onOpen }: { path?: string | null; localUri?: string; onOpen: (src: string) => void }) {
  const t = useTheme();
  const signed = useSignedUrl('chat-photos', localUri ? null : path);
  const src = localUri ?? signed.data;
  if (!src) {
    return (
      <View style={{ width: PHOTO_W, height: 120, alignItems: 'center', justifyContent: 'center', backgroundColor: t.cardMuted }}>
        {signed.isError ? <AppText variant="small" color="muted" style={{ fontStyle: 'italic' }}>Photo unavailable</AppText> : <ActivityIndicator color={t.accent} />}
      </View>
    );
  }
  return (
    <Pressable onPress={() => onOpen(src)} accessibilityRole="imagebutton" accessibilityLabel="Open photo">
      <Image source={{ uri: src }} style={{ width: PHOTO_W, height: PHOTO_H }} contentFit="cover" transition={150} loading="eager" />
    </Pressable>
  );
}

// ---- one message ----

type BubbleProps = {
  message?: ChatMessageRow;
  pending?: OutboxItem;
  mine: boolean;
  tz: string;
  onOpenPhoto: (src: string) => void;
  onRetry?: () => void;
  onDiscard?: () => void;
};

function BubbleBase({ message, pending, mine, tz, onOpenPhoto, onRetry, onDiscard }: BubbleProps) {
  const t = useTheme();
  const kind = message ? messageKind(message) : pending!.kind;
  const failed = pending?.status === 'failed';
  const media = kind === 'photo';
  const fg = mine ? t.accentForeground : t.foreground;
  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%', alignItems: mine ? 'flex-end' : 'flex-start', opacity: pending && !failed ? 0.65 : 1 }}>
      <View
        style={{
          overflow: 'hidden',
          paddingHorizontal: media ? 0 : 14,
          paddingVertical: media ? 0 : 10,
          backgroundColor: failed ? t.cardMuted : mine ? t.accent : t.cardMuted,
          borderWidth: failed ? 1 : mine ? 0 : 1,
          borderColor: failed ? t.danger : t.border,
          borderRadius: 16,
          borderTopRightRadius: mine ? 4 : 16,
          borderTopLeftRadius: mine ? 16 : 4,
        }}>
        {kind === 'photo' ? (
          <PhotoBubble path={message?.image_path} localUri={pending?.shrunkUri ?? pending?.uri} onOpen={onOpenPhoto} />
        ) : kind === 'voice' ? (
          pending ? (
            <AppText style={{ color: failed ? t.foreground : fg }}>🎤 Voice note · {formatDuration(pending.seconds)}</AppText>
          ) : (
            <VoiceBubble id={message!.id} path={message!.audio_path!} seconds={message!.audio_duration_seconds} mine={mine} />
          )
        ) : (
          <AppText style={{ color: failed ? t.foreground : fg }} selectable>{message?.text ?? pending?.text}</AppText>
        )}
      </View>
      {failed ? (
        <View style={{ flexDirection: 'row', gap: 12, marginTop: 2, paddingHorizontal: 4, alignItems: 'center' }}>
          <AppText variant="small" color="danger" style={{ flexShrink: 1 }}>Not sent</AppText>
          <Pressable onPress={onRetry} accessibilityRole="button"><AppText variant="small" color="accent" style={{ fontWeight: '700' }}>Retry</AppText></Pressable>
          <Pressable onPress={onDiscard} accessibilityRole="button"><AppText variant="small" color="muted" style={{ fontWeight: '700' }}>Delete</AppText></Pressable>
        </View>
      ) : (
        <AppText variant="small" color="muted" style={{ fontSize: 10, marginTop: 2, paddingHorizontal: 4 }}>
          {pending ? 'Sending…' : timeLabel(message!.created_at, tz)}
        </AppText>
      )}
    </View>
  );
}
export const Bubble = memo(BubbleBase);

export function DayHeading({ label }: { label: string }) {
  return (
    <AppText variant="small" color="muted" style={{ textAlign: 'center', fontSize: 10, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, marginVertical: spacing.md }}>
      {label}
    </AppText>
  );
}

// ---- composer ----

function useVoiceRecorder(onDone: (uri: string, seconds: number) => void, onError: (message: string) => void) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [active, setActive] = useState(false);
  // The timer that ends a recording at the limit runs later than the render that started it, so everything it
  // needs is read from refs rather than from that render's values.
  const activeRef = useRef(false);
  const starting = useRef(false);
  const limitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latest = useRef({ onDone, onError, durationMillis: 0 });
  useEffect(() => {
    latest.current = { onDone, onError, durationMillis: state.durationMillis };
  });
  useEffect(
    () => () => {
      if (limitTimer.current) clearTimeout(limitTimer.current);
    },
    [],
  );

  const finish = async (send: boolean) => {
    if (!activeRef.current) return;
    activeRef.current = false;
    setActive(false);
    if (limitTimer.current) clearTimeout(limitTimer.current);
    limitTimer.current = null;
    const seconds = Math.round(latest.current.durationMillis / 1000);
    try {
      await recorder.stop();
    } catch {
      // nothing to stop
    }
    await setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    const uri = recorder.uri;
    if (!send || !uri) return;
    if (seconds < VOICE_NOTE_MIN_SECONDS) {
      latest.current.onError('That was too short. Press the microphone and speak for a moment.');
      return;
    }
    latest.current.onDone(uri, Math.min(seconds, VOICE_NOTE_MAX_SECONDS));
  };

  const start = async () => {
    if (starting.current || activeRef.current) return;
    starting.current = true;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onError('Allow microphone access in your settings to send voice notes.');
        return;
      }
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      activeRef.current = true;
      setActive(true);
      // The recording ends by itself at the limit and is sent.
      limitTimer.current = setTimeout(() => void finish(true), VOICE_NOTE_MAX_SECONDS * 1000);
    } catch (e) {
      if (__DEV__) console.warn('[chat] could not start recording', e);
      onError('Could not start recording. Please try again.');
    } finally {
      starting.current = false;
    }
  };

  return { active, seconds: Math.floor(state.durationMillis / 1000), start, send: () => finish(true), cancel: () => finish(false) };
}

export function Composer({
  placeholder,
  disabled,
  onSendText,
  onSendPhoto,
  onSendVoice,
}: {
  placeholder: string;
  disabled?: boolean;
  onSendText: (text: string) => string | null;
  onSendPhoto: (asset: { uri: string; width: number; height: number }) => void;
  onSendVoice: (uri: string, seconds: number) => void;
}) {
  const t = useTheme();
  const [text, setText] = useState('');
  const [menu, setMenu] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const rec = useVoiceRecorder(onSendVoice, setNote);

  const send = () => {
    if (!text.trim()) return;
    const problem = onSendText(text);
    setNote(problem);
    if (!problem) setText('');
  };

  const pick = async (source: 'camera' | 'library') => {
    setMenu(false);
    setNote(null);
    try {
      const photo = await pickPhoto(source);
      if (photo) onSendPhoto(photo);
    } catch (e) {
      setNote(e instanceof PhotoPermissionError ? e.message : 'Could not use that photo. Please try again.');
    }
  };

  const onKeyPress = (e: TextInputKeyPressEvent) => {
    // In the browser Enter sends (Shift+Enter adds a line); on a phone the return key adds a line.
    const n = e.nativeEvent as typeof e.nativeEvent & { shiftKey?: boolean };
    if (Platform.OS === 'web' && n.key === 'Enter' && !n.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  if (disabled) {
    return (
      <View style={{ padding: spacing.md, borderTopWidth: 1, borderTopColor: t.border }}>
        <AppText color="muted" style={{ textAlign: 'center' }}>{placeholder}</AppText>
      </View>
    );
  }

  const circle = { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' } as const;
  const canSend = text.trim().length > 0;

  return (
    <View style={{ borderTopWidth: 1, borderTopColor: t.border, paddingTop: spacing.sm, paddingBottom: spacing.sm, gap: 6 }}>
      {note ? <AppText variant="small" color="danger" style={{ paddingHorizontal: spacing.sm }}>{note}</AppText> : null}
      {rec.active ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Pressable onPress={rec.cancel} accessibilityRole="button" accessibilityLabel="Cancel recording" style={[circle, { backgroundColor: t.cardMuted }]}>
            <Icon name="x" size={20} color={t.foreground} />
          </Pressable>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.cardMuted, borderRadius: 22, paddingHorizontal: 16, height: 44 }}>
            <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.danger }} />
            <AppText style={{ fontVariant: ['tabular-nums'] }}>Recording {formatDuration(rec.seconds) || '0:00'}</AppText>
          </View>
          <Pressable onPress={rec.send} accessibilityRole="button" accessibilityLabel="Send voice note" style={[circle, { backgroundColor: t.accent }]}>
            <Icon name="send" size={20} color={t.accentForeground} />
          </Pressable>
        </View>
      ) : (
        // One rounded bar holds the attach button, the text and the mic; the round teal button beside it sends (the mockup's composer).
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: spacing.sm }}>
          <View style={{ flex: 1, flexDirection: 'row', alignItems: 'flex-end', backgroundColor: t.cardMuted, borderRadius: 22, borderWidth: 1, borderColor: t.border }}>
            <Pressable onPress={() => setMenu(true)} accessibilityRole="button" accessibilityLabel="Attach a photo" hitSlop={4} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
              <Icon name="camera" size={20} color={t.muted} />
            </Pressable>
            <TextInput
              value={text}
              onChangeText={(v) => {
                setText(v);
                if (note) setNote(null);
              }}
              onKeyPress={onKeyPress}
              placeholder={placeholder}
              placeholderTextColor={t.muted}
              multiline
              numberOfLines={Platform.OS === 'web' ? 1 : undefined} // the browser's text area starts two lines tall otherwise
              style={{
                flex: 1,
                maxHeight: 120,
                minHeight: 44,
                color: t.foreground,
                paddingTop: Platform.OS === 'ios' ? 12 : 9,
                paddingBottom: Platform.OS === 'ios' ? 12 : 9,
                fontSize: 16,
                outlineWidth: 0, // no browser focus ring around the bar
              }}
            />
            {canSend ? (
              <View style={{ width: 8 }} />
            ) : (
              <Pressable onPress={rec.start} accessibilityRole="button" accessibilityLabel="Record a voice note" hitSlop={4} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
                <Icon name="mic" size={20} color={t.muted} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={send}
            disabled={!canSend}
            accessibilityRole="button"
            accessibilityLabel="Send"
            accessibilityState={{ disabled: !canSend }}
            style={[circle, { backgroundColor: t.accent, opacity: canSend ? 1 : 0.35 }]}>
            <Icon name="send" size={20} color={t.accentForeground} />
          </Pressable>
        </View>
      )}

      {menu ? <PhotoSourceMenu onPick={pick} onClose={() => setMenu(false)} /> : null}
    </View>
  );
}
