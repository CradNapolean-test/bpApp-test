import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, View } from 'react-native';

import { DEFAULT_TIMEZONE } from '@ballistic/shared/utils/dates';
import { withDayLabels, type ChatListEntry } from '@ballistic/shared/utils/chat';

import { Avatar, Bubble, Composer, DayHeading } from '@/components/chat';
import { PhotoViewer } from '@/components/media';
import { AppText, Button, Screen } from '@/components/ui';
import { setChatVisible, useChatSender, useChatThread, useLoadOlder, useMarkChatRead, useOwnUserId } from '@/lib/chat';
import { useOutbox, type OutboxItem } from '@/lib/chatOutbox';
import { useNow } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { spacing, useTheme } from '@/theme';

type Row = { key: string; entry?: ChatListEntry; pending?: OutboxItem };

export default function Chat() {
  const t = useTheme();
  const me = useMe().data; // only for the coach's name and whether one is assigned; the messages do not wait for it
  const clientId = useOwnUserId();
  const now = useNow(60_000);
  // Times show in the phone's own timezone, like the web chat does in the browser.
  const tz = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || DEFAULT_TIMEZONE, []);

  const threadQ = useChatThread(clientId);
  const older = useLoadOlder(clientId);
  const outbox = useOutbox(clientId);
  const sender = useChatSender(clientId);
  const markRead = useMarkChatRead(clientId);
  const [viewing, setViewing] = useState<string | null>(null);

  // Looking at the conversation means it is read: on opening, and for whatever the coach sends while it is open.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
  useEffect(() => {
    setChatVisible(focused);
    return () => setChatVisible(false);
  }, [focused]);

  // Once per opening (when the messages are there to be seen), then again for each new message from the coach.
  const thread = threadQ.data;
  const newest = thread?.messages[0];
  const hasThread = !!thread;
  const newestId = newest?.id ?? null;
  const newestFromCoach = !!newest && newest.sender_id !== clientId;
  const lastMarked = useRef<string | null | undefined>(undefined); // undefined: nothing marked yet on this visit
  useEffect(() => {
    if (!focused) {
      lastMarked.current = undefined;
      return;
    }
    if (!hasThread || !clientId) return;
    if (lastMarked.current === undefined || (newestFromCoach && newestId !== lastMarked.current)) {
      lastMarked.current = newestId;
      void markRead();
    }
  }, [focused, hasThread, newestId, newestFromCoach, clientId, markRead]);

  const entries = useMemo(() => withDayLabels(thread?.messages ?? [], now, tz), [thread?.messages, now, tz]);
  const rows = useMemo<Row[]>(
    () => [...outbox.map((p) => ({ key: p.localId, pending: p })), ...entries.map((e) => ({ key: e.message.id, entry: e }))],
    [outbox, entries],
  );

  const coach = me?.coachName ?? 'Your coach';
  const noCoach = !!me && !me.hasCoach;

  let body: React.ReactNode;
  if (!clientId || (threadQ.isPending && !thread)) {
    body = <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>;
  } else if (threadQ.isError && !thread) {
    body = (
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your messages: {threadQ.error.message}</AppText>
        <Button title="Try again" onPress={() => threadQ.refetch()} />
      </View>
    );
  } else if (rows.length === 0) {
    body = (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 }}>
        <AppText variant="heading">No messages yet</AppText>
        <AppText color="muted">{noCoach ? 'Your coach will appear here once one is assigned.' : 'Say hello to get the conversation started.'}</AppText>
      </View>
    );
  } else {
    body = (
      <FlatList
        inverted
        data={rows}
        keyExtractor={(r) => r.key}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onEndReachedThreshold={0.4}
        onEndReached={() => {
          if (thread?.hasMore && !older.isPending) older.mutate();
        }}
        ListFooterComponent={
          older.isPending ? (
            <ActivityIndicator color={t.accent} style={{ paddingVertical: spacing.md }} />
          ) : older.isError ? (
            <AppText variant="small" color="danger" style={{ textAlign: 'center', paddingVertical: spacing.md }}>Could not load earlier messages. Scroll up to try again.</AppText>
          ) : thread && !thread.hasMore ? (
            <AppText variant="small" color="muted" style={{ textAlign: 'center', paddingVertical: spacing.md }}>Start of your conversation</AppText>
          ) : undefined
        }
        renderItem={({ item }) =>
          item.pending ? (
            <View style={{ paddingVertical: 3 }}>
              <Bubble
                pending={item.pending}
                mine
                tz={tz}
                onOpenPhoto={setViewing}
                onRetry={() => sender.retry(item.pending!.localId)}
                onDiscard={() => sender.discard(item.pending!.localId)}
              />
            </View>
          ) : (
            <View style={{ paddingVertical: 3 }}>
              {item.entry!.dayLabel ? <DayHeading label={item.entry!.dayLabel} /> : null}
              <Bubble message={item.entry!.message} mine={item.entry!.message.sender_id === clientId} tz={tz} onOpenPhoto={setViewing} />
            </View>
          )
        }
      />
    );
  }

  return (
    <Screen>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm + 2, paddingBottom: spacing.md, borderBottomWidth: 1, borderBottomColor: t.border }}>
          <Avatar name={coach} />
          <View style={{ flex: 1 }}>
            <AppText style={{ fontWeight: '800' }} numberOfLines={1}>{coach}</AppText>
            <AppText variant="small" color="muted">Messages, photos and voice notes</AppText>
          </View>
        </View>
        <View style={{ flex: 1 }}>{body}</View>
        <Composer
          placeholder={noCoach ? 'You can message your coach once one is assigned.' : `Message ${coach}…`}
          disabled={noCoach}
          onSendText={sender.sendText}
          onSendPhoto={sender.sendPhoto}
          onSendVoice={sender.sendVoice}
        />
      </KeyboardAvoidingView>
      <PhotoViewer src={viewing} onClose={() => setViewing(null)} />
    </Screen>
  );
}
