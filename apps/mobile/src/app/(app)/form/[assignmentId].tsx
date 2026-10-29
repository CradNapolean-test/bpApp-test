import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import type { FormAssignmentWithDetails } from '@ballistic/shared/data/types';
import { answeredCount, buildSubmission, parseDraft, type FormAnswer } from '@ballistic/shared/utils/forms';

import { QuestionCard } from '@/components/forms';
import { AppText, Button, Screen, ScrollScreen } from '@/components/ui';
import { loadDraft, removeDraft, saveDraft } from '@/lib/drafts';
import { useFormAssignments, useSubmitForm } from '@/lib/forms';
import { spacing, useTheme } from '@/theme';

// Filling in one form: a card per question, a count of what is answered, the required ones checked before it sends, and a
// draft kept on the phone so leaving half way loses nothing.
export default function FillForm() {
  const t = useTheme();
  const { assignmentId } = useLocalSearchParams<{ assignmentId: string }>();
  const q = useFormAssignments();
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
        <AppText color="danger">Could not load this form: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  if (!assignment) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.sm }}>
        <AppText variant="heading">Form not found</AppText>
        <AppText color="muted">It may have been removed by your coach.</AppText>
      </Screen>
    );
  }
  if (assignment.completed_at) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.sm }}>
        <AppText variant="heading">Already sent</AppText>
        <AppText color="muted">You have already filled in this form. Your answers are under Completed.</AppText>
      </Screen>
    );
  }
  return <Filler assignment={assignment} />;
}

function Filler({ assignment }: { assignment: FormAssignmentWithDetails }) {
  const router = useRouter();
  const t = useTheme();
  const submit = useSubmitForm();
  const questions = assignment.template.questions;

  // The saved draft is read once, when the form opens.
  const [answers, setAnswers] = useState<Record<string, FormAnswer>>(() => parseDraft(loadDraft(assignment.id), questions));
  const latest = useRef(answers);
  const [missing, setMissing] = useState<Set<string>>(new Set());
  // Number questions holding something that is not a number, with what to tell the member (FM2).
  const [invalid, setInvalid] = useState<Record<string, string>>({});
  const scrollRef = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const positions = useRef<Record<string, number>>({});

  function commit(next: Record<string, FormAnswer>, answeredId: string) {
    latest.current = next;
    setAnswers(next);
    saveDraft(assignment.id, next);
    setMissing((m) => {
      if (!m.has(answeredId)) return m;
      const n = new Set(m);
      n.delete(answeredId);
      return n;
    });
    setInvalid((cur) => {
      if (!(answeredId in cur)) return cur;
      const { [answeredId]: _gone, ...rest } = cur;
      return rest;
    });
  }
  const setText = (id: string, v: string) => commit({ ...latest.current, [id]: v }, id);
  const toggle = (id: string, option: string) => {
    const current = Array.isArray(latest.current[id]) ? (latest.current[id] as string[]) : [];
    commit({ ...latest.current, [id]: current.includes(option) ? current.filter((o) => o !== option) : [...current, option] }, id);
  };

  const done = answeredCount(questions, answers);

  function send() {
    const { missing: ids, invalid: bad, payload } = buildSubmission(questions, latest.current);
    const problemIds = questions.map((q) => q.id).filter((id) => ids.includes(id) || id in bad);
    if (problemIds.length > 0) {
      setMissing(new Set(ids));
      setInvalid(bad);
      scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[problemIds[0]] ?? 0) - 12), animated: true });
      return;
    }
    submit.mutate(
      { assignmentId: assignment.id, answers: payload },
      {
        onSuccess: () => {
          removeDraft(assignment.id);
          router.replace('/forms');
        },
      },
    );
  }

  return (
    <ScrollScreen scrollRef={scrollRef}>
      <View style={{ gap: 4 }}>
        <AppText variant="title">{assignment.template.name}</AppText>
        <AppText color="muted">{done} of {questions.length} answered</AppText>
        {assignment.template.description ? <AppText variant="small" color="muted" style={{ marginTop: 4 }}>{assignment.template.description}</AppText> : null}
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: t.border, overflow: 'hidden' }}>
        <View style={{ height: 6, borderRadius: 3, backgroundColor: t.accent, width: `${questions.length ? Math.round((done / questions.length) * 100) : 0}%` }} />
      </View>

      {questions.map((question, i) => (
        <QuestionCard
          key={question.id}
          index={i}
          question={question}
          value={answers[question.id]}
          showError={missing.has(question.id)}
          error={invalid[question.id] ?? null}
          onText={(v) => setText(question.id, v)}
          onToggle={(o) => toggle(question.id, o)}
          onLayoutY={(y) => { positions.current[question.id] = y; }}
        />
      ))}

      {Object.keys(invalid).length > 0 ? <AppText color="danger" style={{ textAlign: 'center', fontWeight: '700' }}>Check the highlighted answers: a number question needs a number.</AppText> : null}
      {missing.size > 0 ? <AppText color="danger" style={{ textAlign: 'center', fontWeight: '700' }}>{missing.size} required question{missing.size === 1 ? '' : 's'} still to answer</AppText> : null}
      {submit.isError ? <AppText color="danger" style={{ textAlign: 'center' }}>{submit.error.message}</AppText> : null}
      <Button title={submit.isPending ? 'Submitting…' : 'Submit'} onPress={send} loading={submit.isPending} />
    </ScrollScreen>
  );
}
