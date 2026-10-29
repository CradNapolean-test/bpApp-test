import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import type { FormAssignmentWithDetails, FormQuestionRow } from '@ballistic/shared/data/types';
import { answerText, cleanNumberInput, estimatedMinutes, MAX_LONG_ANSWER, MAX_SHORT_ANSWER, type FormAnswer } from '@ballistic/shared/utils/forms';

import { Pressable } from '@/components/press';
import { ChoiceRow, Input } from '@/components/fields';
import { IconChip } from '@/components/home';
import { Icon, type IconName } from '@/components/icons';
import { AppText, Button, Card } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// A form waiting to be filled in: name, how long it takes, and a Fill out button.
export function FormToFillCard({ assignment }: { assignment: FormAssignmentWithDetails }) {
  const t = useTheme();
  const router = useRouter();
  const n = assignment.template.questions.length;
  return (
    <View style={{ borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 40, height: 40, borderRadius: 13, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="clipboardList" size={20} color={t.accentForeground} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>{assignment.template.name}</AppText>
          <AppText variant="small" color="muted">{n} question{n === 1 ? '' : 's'} · about {estimatedMinutes(n)} min</AppText>
          {assignment.template.description ? <AppText variant="small" color="muted" numberOfLines={2} style={{ marginTop: 4 }}>{assignment.template.description}</AppText> : null}
        </View>
      </View>
      <Button title="Fill out" onPress={() => router.navigate({ pathname: '/form/[assignmentId]', params: { assignmentId: assignment.id } })} />
    </View>
  );
}

// A finished form: one line until it is tapped, then the answers given.
export function CompletedFormCard({ assignment }: { assignment: FormAssignmentWithDetails }) {
  const t = useTheme();
  const [open, setOpen] = useState(false);
  return (
    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <Pressable onPress={() => setOpen((v) => !v)} accessibilityRole="button" accessibilityState={{ expanded: open }} aria-expanded={open} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 }}>
        <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(16,185,129,0.12)', alignItems: 'center', justifyContent: 'center' }}>
          <Icon name="circleCheck" size={18} color={t.success} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '700' }} numberOfLines={1}>{assignment.template.name}</AppText>
          <AppText variant="small" color="muted">Completed {assignment.completed_at ? fmtDate(assignment.completed_at) : ''}</AppText>
        </View>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={18} color={t.muted} />
      </Pressable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: t.border, padding: spacing.md, gap: 12 }}>
          {assignment.template.questions.map((q) => (
            <View key={q.id} style={{ gap: 2 }}>
              <AppText variant="small" color="muted">{q.question_text}</AppText>
              <AppText style={{ fontWeight: '600' }}>{answerText(assignment.responses.find((r) => r.question_id === q.id)?.answer)}</AppText>
            </View>
          ))}
        </View>
      ) : null}
    </Card>
  );
}

// One question of a form being filled in: its number, the wording, Required / Optional and the right input for its type.
export function QuestionCard({
  index,
  question,
  value,
  showError,
  error,
  onText,
  onToggle,
  onLayoutY,
}: {
  index: number;
  question: FormQuestionRow;
  value: FormAnswer | undefined;
  showError: boolean;
  // Set when a number question holds text that is not a real number (FM2).
  error?: string | null;
  onText: (v: string) => void;
  onToggle: (option: string) => void;
  onLayoutY?: (y: number) => void;
}) {
  const t = useTheme();
  const options = question.options ?? [];
  return (
    <View
      onLayout={(e) => onLayoutY?.(e.nativeEvent.layout.y)}
      style={{ backgroundColor: t.card, borderWidth: 1, borderColor: showError || error ? t.danger : t.border, borderRadius: radius.lg, padding: spacing.md, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
        <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          <AppText style={{ color: t.accentText, fontSize: 12, fontWeight: '800' }}>{index + 1}</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '700', fontSize: 16 }}>{question.question_text}</AppText>
          <AppText style={{ fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' }} color="muted">{question.required ? 'Required' : 'Optional'}</AppText>
        </View>
      </View>

      {question.question_type === 'short_text' ? <Input value={typeof value === 'string' ? value : ''} onChangeText={onText} maxLength={MAX_SHORT_ANSWER} accessibilityLabel={question.question_text} /> : null}
      {question.question_type === 'long_text' ? <Input multiline value={typeof value === 'string' ? value : ''} onChangeText={onText} maxLength={MAX_LONG_ANSWER} accessibilityLabel={question.question_text} /> : null}
      {question.question_type === 'number' ? (
        <Input value={typeof value === 'string' ? value : ''} onChangeText={(v) => onText(cleanNumberInput(v))} keyboardType="numbers-and-punctuation" inputMode="decimal" maxLength={20} accessibilityLabel={question.question_text} />
      ) : null}
      {question.question_type === 'single_choice' ? (
        <View style={{ gap: 8 }}>
          {options.map((opt) => <ChoiceRow key={opt} title={opt} selected={value === opt} onPress={() => onText(opt)} />)}
        </View>
      ) : null}
      {question.question_type === 'multi_choice' ? (
        <View style={{ gap: 8 }}>
          {options.map((opt) => <ChoiceRow key={opt} title={opt} selected={Array.isArray(value) && value.includes(opt)} onPress={() => onToggle(opt)} />)}
          <AppText variant="small" color="muted">Pick as many as apply.</AppText>
        </View>
      ) : null}

      {error ? <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>{error}</AppText> : null}
      {showError && !error ? <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>Please answer this one.</AppText> : null}
    </View>
  );
}

// The "nothing here yet" block (also used by Events, Rewards, Resources and the recipe list).
export function FormsEmpty({ text, icon = 'fileText', title = 'No forms yet' }: { text: string; icon?: IconName; title?: string }) {
  return (
    <View style={{ alignItems: 'center', gap: 10, paddingVertical: spacing.xl }}>
      <IconChip icon={icon} size={52} />
      <AppText variant="heading">{title}</AppText>
      <AppText color="muted" style={{ textAlign: 'center' }}>{text}</AppText>
    </View>
  );
}
