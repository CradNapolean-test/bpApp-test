import { ActivityIndicator, View } from 'react-native';

import { CompletedFormCard, FormToFillCard, FormsEmpty } from '@/components/forms';
import { CheckinTabs } from '@/components/pagetabs';
import { AppText, Button, Screen, ScrollScreen, SectionLabel } from '@/components/ui';
import { useFormAssignments } from '@/lib/forms';
import { spacing, useTheme } from '@/theme';

// The member's forms from their coach: the ones still to fill out, then the finished ones with their answers.
export default function Forms() {
  const t = useTheme();
  const q = useFormAssignments();

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
        <AppText color="danger">Could not load your forms: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }

  const pending = q.data.filter((a) => !a.completed_at);
  const completed = q.data.filter((a) => a.completed_at);
  return (
    <ScrollScreen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      <CheckinTabs current="forms" />
      {pending.length > 0 ? (
        <View>
          <SectionLabel>To fill out</SectionLabel>
          <View style={{ gap: spacing.sm }}>{pending.map((a) => <FormToFillCard key={a.id} assignment={a} />)}</View>
        </View>
      ) : null}
      {completed.length > 0 ? (
        <View>
          <SectionLabel>Completed</SectionLabel>
          <View style={{ gap: spacing.sm }}>{completed.map((a) => <CompletedFormCard key={a.id} assignment={a} />)}</View>
        </View>
      ) : null}
      {q.data.length === 0 ? <FormsEmpty text="Your coach hasn't sent you a form to fill out." /> : null}
    </ScrollScreen>
  );
}
