import { ActivityIndicator, View } from 'react-native';

import { CourseCard } from '@/components/learn';
import { FormsEmpty } from '@/components/forms';
import { AppText, Button, Screen, ScrollScreen } from '@/components/ui';
import { useCourseAssignments } from '@/lib/education';
import { spacing, useTheme } from '@/theme';

// Resources: the courses the coach has assigned, with how far the member is through each.
export default function Learn() {
  const t = useTheme();
  const q = useCourseAssignments();
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
        <AppText color="danger">Could not load your courses: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  return (
    <ScrollScreen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
      {q.data.length === 0 ? (
        <FormsEmpty icon="graduationCap" title="Nothing assigned yet" text="Your coach hasn't assigned any courses yet." />
      ) : (
        <View style={{ gap: spacing.sm }}>{q.data.map((a) => <CourseCard key={a.id} assignment={a} />)}</View>
      )}
    </ScrollScreen>
  );
}
