import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { EducationCourseAssignmentWithDetails } from '@ballistic/shared/data/types';
import { isoDateInTz } from '@ballistic/shared/utils/dates';
import { courseCompletionPercent } from '@ballistic/shared/utils/educationProgress';
import { firstUnfinishedModuleId, orderedModules } from '@ballistic/shared/utils/education';

import { ModuleCard } from '@/components/learn';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { useCourseAssignments, useToggleLesson } from '@/lib/education';
import { timezoneOf, useClientProfile, useNow } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// One course: the progress so far, then its sections and lessons. Locked lessons show when they open.
export default function Course() {
  const t = useTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const q = useCourseAssignments();
  const assignment = q.data?.find((a) => a.id === assignmentId);
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
        <AppText color="danger">Could not load this course: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.sm }}>
        <AppText variant="heading">Course not found</AppText>
        <AppText color="muted">It may have been removed by your coach.</AppText>
      </Screen>
    );
  }
  return <CourseContent assignment={assignment} />;
}

function CourseContent({ assignment }: { assignment: EducationCourseAssignmentWithDetails }) {
  const profile = useClientProfile().data ?? null;
  const now = useNow(60_000);
  const todayIso = isoDateInTz(now, timezoneOf(profile));
  const toggle = useToggleLesson();
  const modules = orderedModules(assignment.course);
  const completedIds = new Set(assignment.completions.map((c) => c.lesson_id));
  const pct = courseCompletionPercent(assignment.course, assignment.completions);
  // The first section that still has something left starts open; the member opens the rest.
  const [open, setOpen] = useState<Set<string>>(() => {
    const first = firstUnfinishedModuleId(assignment.course, assignment.completions);
    return new Set(first ? [first] : []);
  });
  const t = useTheme();
  const flip = (id: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <ScrollScreen>
      <View style={{ gap: 4 }}>
        <AppText variant="title">{assignment.course.title}</AppText>
        {assignment.course.description ? <AppText color="muted">{assignment.course.description}</AppText> : null}
      </View>
      <Card style={{ gap: spacing.sm, padding: 12 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText style={{ fontWeight: '700' }}>Your progress</AppText>
          <AppText color="accent" style={{ fontWeight: '800' }}>{pct}%</AppText>
        </View>
        <View style={{ height: 8, borderRadius: 4, backgroundColor: t.border, overflow: 'hidden' }}>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.accent, width: `${pct}%` }} />
        </View>
      </Card>
      {toggle.isError ? <AppText color="danger" style={{ fontWeight: '600' }}>{toggle.error.message}</AppText> : null}
      {modules.map((m) => (
        <ModuleCard
          key={m.id}
          module={m}
          completedIds={completedIds}
          todayIso={todayIso}
          open={open.has(m.id)}
          onToggle={() => flip(m.id)}
          busy={toggle.isPending}
          onToggleLesson={(lessonId, complete) => toggle.mutate({ lessonId, complete })}
        />
      ))}
      {modules.length === 0 ? <AppText color="muted">No sections in this course yet.</AppText> : null}
    </ScrollScreen>
  );
}
