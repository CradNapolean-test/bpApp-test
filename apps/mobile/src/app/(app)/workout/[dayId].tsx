import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { WorkoutExerciseRow, WorkoutLogRow } from '@ballistic/shared/data/types';
import { isoDateInTz } from '@ballistic/shared/utils/dates';
import { latestMax } from '@ballistic/shared/utils/oneRepMax';
import { dayProgress } from '@ballistic/shared/utils/programOverview';
import { blockForDisplay, memberDayBlocks } from '@ballistic/shared/utils/workoutDisplay';
import { earlierLogs, lastSessionFor, priorBestLoad } from '@ballistic/shared/utils/workoutHistory';
import { finishMessage, workoutSummary } from '@ballistic/shared/utils/workoutSets';
import { blockFormatOf, chosenBlockKeys, exerciseIsVisible, slotOptions, usesSections } from '@ballistic/shared/workoutSections';
import { blockConfigOf } from '@ballistic/shared/blockScoring';
import { trackingOf } from '@ballistic/shared/workoutTracking';

import { BlockResultForm, BlockView, ExerciseCard, FeedbackForm, SetEditSheet, WarmupTick } from '@/components/workouts';
import { AppText, Button, Card, Chip, Screen, ScrollScreen } from '@/components/ui';
import { timezoneOf, useClientProfile, useNow } from '@/lib/today';
import { useChooseBlock, useDeleteBlockResult, useDeleteSet, useLogSet, useSaveBlockResult, useSaveFeedback, useUpdateSet, useWorkoutDay } from '@/lib/workouts';
import { spacing, useTheme } from '@/theme';

export default function WorkoutDay() {
  const t = useTheme();
  const router = useRouter();
  const { dayId } = useLocalSearchParams<{ dayId: string }>();
  const now = useNow(60_000);
  const profile = useClientProfile().data ?? null;
  const tz = timezoneOf(profile);
  const todayIso = isoDateInTz(now, tz);

  const dayQ = useWorkoutDay(dayId);
  const logSet = useLogSet(dayId);
  const updateSet = useUpdateSet(dayId);
  const deleteSet = useDeleteSet(dayId);
  const choose = useChooseBlock(dayId);
  const feedback = useSaveFeedback(dayId);
  const saveResult = useSaveBlockResult(dayId);
  const clearResult = useDeleteBlockResult(dayId);
  const [editing, setEditing] = useState<{ log: WorkoutLogRow; index: number } | null>(null);
  // What the workout came to, shown when the member finishes it (L4): sets and exercises, or that nothing was logged.
  const [summary, setSummary] = useState<string | null>(null);

  if (dayQ.isPending) {
    return (
      <Screen style={{ gap: spacing.md }}>
        <View style={{ flex: 1, justifyContent: 'center' }}><ActivityIndicator color={t.accent} /></View>
      </Screen>
    );
  }
  if (dayQ.isError) {
    return (
      <Screen style={{ gap: spacing.md }}>
        <AppText color="danger">Could not load this workout: {dayQ.error.message}</AppText>
        <Button title="Try again" onPress={() => dayQ.refetch()} />
      </Screen>
    );
  }

  const d = dayQ.data;
  const exercises = d.exercises;
  const sectioned = usesSections(exercises);
  const chosen = chosenBlockKeys(d.choices.slot1, d.choices.slot2);
  const visible = sectioned ? exercises.filter((e) => exerciseIsVisible(e, true, chosen)) : exercises;
  const lifts = visible.filter((e) => e.block_type === 'exercise');

  const logsByExercise = new Map<string, WorkoutLogRow[]>();
  for (const l of d.logs) if (l.exercise_id) (logsByExercise.get(l.exercise_id) ?? logsByExercise.set(l.exercise_id, []).get(l.exercise_id)!).push(l);
  const logged = new Set(logsByExercise.keys());
  const progress = dayProgress(lifts, logged);
  const refs = new Map(Object.entries(d.refs));

  const layout = memberDayBlocks(exercises, true);

  const renderExercise = (ex: WorkoutExerciseRow, index: number) => {
    const logs = (logsByExercise.get(ex.id) ?? []).sort((a, b) => (a.set_number ?? 0) - (b.set_number ?? 0) || a.logged_at.localeCompare(b.logged_at));
    const earlier = earlierLogs(d.history, refs, ex.exercise_library_id, ex.name, ex.id);
    return (
      <ExerciseCard
        key={ex.id}
        exercise={ex}
        index={index}
        tz={tz}
        library={ex.exercise_library_id ? d.library[ex.exercise_library_id] : undefined}
        resolvedMax={ex.prescription_type === 'percent_1rm' ? latestMax(d.maxes, ex.exercise_library_id) : null}
        logs={logs}
        last={lastSessionFor(earlier, tz, todayIso)}
        priorBest={Math.max(priorBestLoad(earlier) ?? 0, d.priorBests[ex.exercise_library_id ?? `n:${ex.name.toLowerCase()}`] ?? 0) || null}
        onLog={(e, setNumber, v) => logSet.mutate({ exercise: e, setNumber, actual_reps: v.reps, actual_load: v.load, actual_rpe: v.rpe, actual_seconds: v.seconds, actual_distance: v.distance, actual_calories: v.calories })}
        onEditSet={(log, i) => setEditing({ log, index: i })}
      />
    );
  };

  // The block's result form, for a block the coach scored (rounds and reps, a finish time, a score or a tick).
  const resultFooter = (key: string, rows: WorkoutExerciseRow[]) => {
    const config = blockConfigOf(rows);
    if (config.scoring === 'none' || rows.length === 0) return undefined;
    const result = d.results.find((r) => r.block_key === key);
    return (
      <BlockResultForm
        key={`${key}:${result?.id ?? 'new'}`}
        config={config}
        result={result}
        onSave={(v) =>
          saveResult.mutate({ blockKey: key, format: blockFormatOf(rows), scoring: config.scoring as Exclude<typeof config.scoring, 'none'>, rounds: v.rounds, reps: v.reps, seconds: v.seconds, score: v.score, done: v.done })
        }
        onClear={() => clearResult.mutate({ blockKey: key })}
      />
    );
  };

  const slotView = (slot: 1 | 2) => {
    const { options, locked } = slotOptions(layout.present, slot, d.choices.slot1);
    if (locked || options.length === 0) return null; // one long conditioning block covers both slots
    const pick = slot === 1 ? d.choices.slot1 : d.choices.slot2;
    const rows = pick ? layout.blocks.get(pick) ?? [] : [];
    return (
      <View key={slot} style={{ gap: spacing.sm }}>
        <AppText style={{ fontWeight: '800' }}>{pick === 'conditioning:0' ? 'Both blocks · 20 minutes' : `Block ${slot} · 10 minutes`}</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {options.map((o) => <Chip key={o.key} label={o.label} active={pick === o.key} onPress={() => choose.mutate({ slot, blockKey: o.key })} />)}
        </View>
        {!pick ? <AppText variant="small" color="muted">{slot === 1 ? 'Pick what you are doing for the first 10 minutes.' : 'Pick again for the second 10 minutes. You can switch.'}</AppText> : null}
        {pick && rows.length ? <BlockView block={blockForDisplay(pick, rows)} renderExercise={renderExercise} footer={resultFooter(pick, rows)} /> : null}
      </View>
    );
  };

  return (
    <>
      <ScrollScreen refreshing={dayQ.isRefetching} onRefresh={() => dayQ.refetch()}>
        <View style={{ gap: 2 }}>
          <AppText variant="title">{d.day.day_label}</AppText>
          <AppText color="muted">Week {d.day.week_num}</AppText>
        </View>
        {d.day.notes ? <AppText color="muted">{d.day.notes}</AppText> : null}

        {lifts.length ? (
          <View style={{ gap: 6 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <AppText variant="small" style={{ fontWeight: '700' }}>{progress.done} of {progress.total} exercises logged</AppText>
              {progress.allDone ? <AppText variant="small" color="success" style={{ fontWeight: '700' }}>All done ✓</AppText> : null}
            </View>
            <View style={{ height: 6, borderRadius: 3, backgroundColor: t.cardMuted, overflow: 'hidden' }}>
              <View style={{ width: `${progress.pct}%`, height: 6, backgroundColor: t.accent }} />
            </View>
          </View>
        ) : null}

        {exercises.length === 0 ? <Card><AppText color="muted">No exercises in this workout yet.</AppText></Card> : null}
        {layout.ordered.map((b) => {
          const warmups = b.rows.filter((e) => e.section === 'warmup' && e.block_type === 'exercise');
          const warmupDone = warmups.length > 0 && warmups.every((e) => (logsByExercise.get(e.id) ?? []).length > 0);
          // One tick for the whole warm-up: it saves a no-numbers warm-up set for each warm-up exercise (or takes them back out).
          const toggleWarmup = () => {
            for (const e of warmups) {
              const rows = logsByExercise.get(e.id) ?? [];
              if (warmupDone) rows.forEach((r) => deleteSet.mutate({ logId: r.id }));
              else if (rows.length === 0) logSet.mutate({ exercise: e, setNumber: 1, setType: 'warmup', actual_reps: null, actual_load: null, actual_rpe: null });
            }
          };
          return <BlockView key={b.key} block={b} renderExercise={renderExercise} headerExtra={warmups.length > 0 ? <WarmupTick done={warmupDone} onToggle={toggleWarmup} /> : undefined} footer={resultFooter(b.key, b.rows)} />;
        })}

        {layout.choosing ? (
          <View style={{ gap: spacing.md, borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentSoft, borderRadius: 16, padding: spacing.md }}>
            <View>
              <AppText style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: t.accentText }}>Strong or Conditioning</AppText>
              <AppText variant="small" color="muted">Choose for each 10-minute block, and switch after the first if you want.</AppText>
            </View>
            {slotView(1)}
            {slotView(2)}
          </View>
        ) : null}

        <FeedbackForm
          key={d.feedback?.id ?? 'new'}
          initialRpe={d.feedback?.session_rpe ?? null}
          initialNotes={d.feedback?.notes ?? null}
          saving={feedback.isPending}
          saved={feedback.isSuccess}
          onSave={(rpe, notes) => feedback.mutate({ sessionRpe: rpe, notes })}
        />

        {summary ? (
          <>
            <AppText color="success" style={{ fontWeight: '700' }}>{summary}</AppText>
            <Button title="Back to workouts" onPress={() => router.replace('/workouts')} />
          </>
        ) : (
          <Button title="Finish workout" onPress={() => setSummary(finishMessage(workoutSummary([...logsByExercise.values()].map((l) => l.length))))} />
        )}
      </ScrollScreen>

      {editing ? (
        <SetEditSheet
          log={editing.log}
          index={editing.index}
          tracking={trackingOf(exercises.find((e) => e.id === editing.log.exercise_id)?.tracking_type)}
          onClose={() => setEditing(null)}
          onSave={(v) => { updateSet.mutate({ logId: editing.log.id, actual_reps: v.reps, actual_load: v.load, actual_rpe: v.rpe, actual_seconds: v.seconds, actual_distance: v.distance, actual_calories: v.calories }); setEditing(null); }}
          onDelete={() => { deleteSet.mutate({ logId: editing.log.id }); setEditing(null); }}
        />
      ) : null}
    </>
  );
}
