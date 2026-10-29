import { ActivityIndicator, View } from 'react-native';

import { EventCard } from '@/components/community';
import { FormsEmpty } from '@/components/forms';
import { AppText, Button, Screen, ScrollScreen } from '@/components/ui';
import { useEvents, useToggleEvent } from '@/lib/community';
import { useNow } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// Gym events (walks, paddles, the Christmas do): tap "I'm in" to sign up and again to leave.
export default function Events() {
  const t = useTheme();
  const now = useNow(60_000);
  const q = useEvents();
  const toggle = useToggleEvent();

  if (q.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (q.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load the events: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  return (
    <ScrollScreen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {toggle.isError ? <AppText color="danger" style={{ fontWeight: '600' }}>{toggle.error.message}</AppText> : null}
      {q.data.length === 0 ? (
        <FormsEmpty icon="trophy" title="No upcoming events" text="Gym events like walks, paddles and the Christmas do will show up here." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {q.data.map((e) => (
            <EventCard key={e.id} event={e} now={now} busy={toggle.isPending && toggle.variables?.event.id === e.id} onToggle={() => toggle.mutate({ event: e })} />
          ))}
        </View>
      )}
    </ScrollScreen>
  );
}
