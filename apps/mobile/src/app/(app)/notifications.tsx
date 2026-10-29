import { useEffect, useRef } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';

import { NotificationRowView } from '@/components/notifications';
import { AppText, Button, Screen, SmallButton } from '@/components/ui';
import { useClearAllNotifications, useClearNotification, useMarkNotificationsSeen, useNotifications } from '@/lib/notifications';
import { spacing, useTheme } from '@/theme';

// Opening this screen marks everything seen (the bell dot goes), but notifications stay until the member clears them:
// one at a time with the cross, or all at once.
export default function Notifications() {
  const t = useTheme();
  const q = useNotifications();
  const seen = useMarkNotificationsSeen();
  const clearOne = useClearNotification();
  const clearAll = useClearAllNotifications();

  const marked = useRef(false);
  const items = q.data;
  const hasUnseen = !!items?.some((n) => !n.read_at);
  useEffect(() => {
    if (!q.isSuccess || marked.current) return;
    marked.current = true;
    if (hasUnseen) seen.mutate();
  }, [q.isSuccess, hasUnseen, seen]);

  return (
    <Screen style={{ gap: spacing.md }}>
      {items && items.length > 0 ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <SmallButton title="Clear all" tone="muted" onPress={() => clearAll.mutate()} />
        </View>
      ) : null}

      {q.isPending ? (
        <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />
      ) : q.isError ? (
        <View style={{ gap: spacing.md }}>
          <AppText color="danger">Could not load your notifications: {q.error.message}</AppText>
          <Button title="Try again" onPress={() => q.refetch()} />
        </View>
      ) : q.data.length === 0 ? (
        <View style={{ gap: 4 }}>
          <AppText variant="heading">No notifications</AppText>
          <AppText color="muted">You&apos;re all caught up.</AppText>
        </View>
      ) : (
        <FlatList
          data={q.data}
          keyExtractor={(n) => n.id}
          refreshing={q.isRefetching}
          onRefresh={() => q.refetch()}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => <NotificationRowView n={item} onClear={() => clearOne.mutate(item.id)} />}
        />
      )}
    </Screen>
  );
}
