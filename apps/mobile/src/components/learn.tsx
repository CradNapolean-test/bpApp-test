import * as WebBrowser from 'expo-web-browser';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { EducationCourseAssignmentWithDetails, EducationLessonRow, EducationModuleWithLessons } from '@ballistic/shared/data/types';
import { courseCompletionPercent } from '@ballistic/shared/utils/educationProgress';
import { courseStatus, moduleProgress, orderedLessons, safeHttpUrl } from '@ballistic/shared/utils/education';
import { parseVideoEmbedUrl } from '@ballistic/shared/utils/videoEmbed';

import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { AppText, Button, Card } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

function Bar({ pct, height = 6 }: { pct: number; height?: number }) {
  const t = useTheme();
  return (
    <View style={{ height, borderRadius: height / 2, backgroundColor: t.border, overflow: 'hidden' }}>
      <View style={{ height, borderRadius: height / 2, backgroundColor: t.accent, width: `${pct}%` }} />
    </View>
  );
}

// A course in the list: its title, how far the member is, how many sections.
export function CourseCard({ assignment }: { assignment: EducationCourseAssignmentWithDetails }) {
  const router = useRouter();
  const pct = courseCompletionPercent(assignment.course, assignment.completions);
  const sections = assignment.course.education_modules.length;
  return (
    <Pressable onPress={() => router.navigate({ pathname: '/course/[assignmentId]', params: { assignmentId: assignment.id } })} accessibilityRole="button" accessibilityLabel={`${assignment.course.title}, ${pct}% done`}>
      <Card style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <AppText style={{ fontWeight: '800', flex: 1 }}>{assignment.course.title}</AppText>
          <AppText color="accent" style={{ fontWeight: '800' }}>{pct}%</AppText>
        </View>
        <Bar pct={pct} height={8} />
        <AppText variant="small" color="muted">
          {courseStatus(pct, assignment.completions.length)} · {sections} section{sections === 1 ? '' : 's'}
        </AppText>
      </Card>
    </Pressable>
  );
}

async function openLink(url: string) {
  const safe = safeHttpUrl(url);
  if (safe) await WebBrowser.openBrowserAsync(safe);
}

// One lesson: locked until its date, otherwise it opens to show the video or link, the text and a Mark complete button.
function LessonItem({ lesson, completed, unlocked, open, busy, onToggleOpen, onToggleComplete }: { lesson: EducationLessonRow; completed: boolean; unlocked: boolean; open: boolean; busy: boolean; onToggleOpen: () => void; onToggleComplete: () => void }) {
  const t = useTheme();
  if (!unlocked) {
    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, padding: 12, opacity: 0.6 }}>
        <Icon name="lock" size={16} color={t.muted} />
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '600' }}>{lesson.title}</AppText>
          <AppText variant="small" color="muted">
            Available from {new Date((lesson.unlock_at ?? '') + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
          </AppText>
        </View>
      </View>
    );
  }
  const isVideo = !!lesson.link_url && !!parseVideoEmbedUrl(lesson.link_url);
  const link = safeHttpUrl(lesson.link_url);
  return (
    <View style={{ borderWidth: 1, borderColor: t.border, borderRadius: radius.md, overflow: 'hidden' }}>
      <Pressable onPress={onToggleOpen} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: completed ? t.accent : t.border, backgroundColor: completed ? t.accent : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {completed ? <Icon name="check" size={14} color={t.accentForeground} strokeWidth={3} /> : null}
        </View>
        <AppText style={{ flex: 1, fontWeight: '600' }}>{lesson.title}</AppText>
        {isVideo ? <Icon name="circlePlay" size={16} color={t.muted} /> : null}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} color={t.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.sm, borderTopWidth: 1, borderTopColor: t.border, padding: 12 }}>
          {link ? (
            <Pressable onPress={() => openLink(link)} accessibilityRole="link" style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}>
              <Icon name={isVideo ? 'circlePlay' : 'externalLink'} size={16} color={t.accent} />
              <AppText color="accent" style={{ fontWeight: '700' }}>{isVideo ? 'Watch the video' : 'Open link'}</AppText>
            </Pressable>
          ) : null}
          {lesson.body ? <AppText color="muted">{lesson.body}</AppText> : null}
          <Button title={completed ? 'Completed ✓' : 'Mark complete'} variant={completed ? 'primary' : 'secondary'} onPress={onToggleComplete} disabled={busy} />
        </View>
      ) : null}
    </View>
  );
}

// A section of a course: its lessons, collapsed or open.
export function ModuleCard({
  module,
  completedIds,
  todayIso,
  open,
  onToggle,
  busy,
  onToggleLesson,
}: {
  module: EducationModuleWithLessons;
  completedIds: Set<string>;
  todayIso: string;
  open: boolean;
  onToggle: () => void;
  busy: boolean;
  onToggleLesson: (lessonId: string, complete: boolean) => void;
}) {
  const t = useTheme();
  const [openLesson, setOpenLesson] = useState<string | null>(null);
  const lessons = orderedLessons(module);
  const { done, total } = moduleProgress(module, [...completedIds].map((lesson_id) => ({ lesson_id })));
  return (
    <Card style={{ padding: 0 }}>
      <Pressable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '800' }}>{module.title}</AppText>
          <AppText variant="small" color="muted">{done} of {total} lesson{total === 1 ? '' : 's'} done</AppText>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={t.muted} />
      </Pressable>
      {open ? (
        <View style={{ gap: spacing.sm, paddingHorizontal: 12, paddingBottom: 12 }}>
          {lessons.map((l) => (
            <LessonItem
              key={l.id}
              lesson={l}
              completed={completedIds.has(l.id)}
              unlocked={l.unlock_at == null || l.unlock_at <= todayIso}
              open={openLesson === l.id}
              busy={busy}
              onToggleOpen={() => setOpenLesson(openLesson === l.id ? null : l.id)}
              onToggleComplete={() => onToggleLesson(l.id, !completedIds.has(l.id))}
            />
          ))}
          {lessons.length === 0 ? <AppText color="muted">No lessons in this section yet.</AppText> : null}
        </View>
      ) : null}
    </Card>
  );
}
