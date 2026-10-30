import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import {
  inputsFromResult,
  isBlankResult,
  readResultInputs,
  resultFields,
  resultLabel,
  resultSummary,
  type BlockConfig,
  type ResultField,
  type ResultInputs,
  type ResultValues,
} from '@ballistic/shared/blockScoring';
import type { ExerciseLibraryRow, WorkoutBlockResultRow, WorkoutExerciseRow, WorkoutLogRow } from '@ballistic/shared/data/types';
import { WEEKDAY_SHORT } from '@ballistic/shared/utils/dates';
import { groupBySuperset } from '@ballistic/shared/utils/exerciseGrouping';
import { percentOfMaxKg, type ResolvedMax } from '@ballistic/shared/utils/oneRepMax';
import type { DaySummary } from '@ballistic/shared/utils/programOverview';
import type { DisplayBlock } from '@ballistic/shared/utils/workoutDisplay';
import { isNewBest, lastLogFor, type LastSession } from '@ballistic/shared/utils/workoutHistory';
import { isWeightless, nextSetNumber } from '@ballistic/shared/utils/workoutSets';
import {
  blankSetMessage,
  formatDistance,
  formatDuration,
  hasMeasure,
  hasRecordedValue,
  inputsFromLog,
  isBlankSet,
  readSetInputs,
  setSummary,
  trackingOf,
  type LogValues,
  type SetInputs,
  type SetValues,
  type TrackingType,
} from '@ballistic/shared/workoutTracking';
import { parseQuantity } from '@ballistic/shared/utils/foodQuantity';

import { safeHttpUrl } from '@ballistic/shared/utils/education';

import { Pressable } from '@/components/press';
import { AppText, Button, Card, Chip, SheetFrame, SmallButton, TextField } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// ---------- programme overview ----------
export function WeekPills({ weeks, active, current, onChange }: { weeks: number[]; active: number; current: number | null; onChange: (w: number) => void }) {
  const t = useTheme();
  const i = weeks.indexOf(active);
  // Keep the selected week in view: remember where each pill sits and scroll to it when the selection changes.
  const scroller = useRef<React.ComponentRef<typeof ScrollView>>(null);
  const xs = useRef<Record<number, number>>({});
  const scrollToActive = () => {
    const x = xs.current[active];
    if (x != null) scroller.current?.scrollTo({ x: Math.max(0, x - 48), animated: true });
  };
  useEffect(scrollToActive, [active]);
  const arrow = (label: string, glyph: string, disabled: boolean, go: () => void) => (
    <Pressable accessibilityLabel={label} disabled={disabled} onPress={go} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.3 : 1 }}>
      <AppText variant="heading" color="muted">{glyph}</AppText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {arrow('Previous week', '‹', i <= 0, () => onChange(weeks[i - 1]))}
      <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ gap: 8, paddingVertical: 2 }}>
        {weeks.map((w) => {
          const on = w === active;
          return (
            <Pressable key={w} onLayout={(e) => { xs.current[w] = e.nativeEvent.layout.x; if (w === active) scrollToActive(); }} onPress={() => onChange(w)} accessibilityRole="button" accessibilityState={{ selected: on }} style={{ paddingHorizontal: 16, paddingVertical: 9, borderRadius: 999, backgroundColor: on ? t.accent : t.card, borderWidth: on ? 0 : 1, borderColor: t.border, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <AppText style={{ fontWeight: '800', color: on ? t.accentForeground : t.foreground }}>Week {w}</AppText>
              {w === current ? <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: on ? t.accentForeground : t.accent }} /> : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {arrow('Next week', '›', i >= weeks.length - 1, () => onChange(weeks[i + 1]))}
    </View>
  );
}

export function DayCard({ day }: { day: DaySummary }) {
  const t = useTheme();
  const weekday = day.dayPosition != null ? WEEKDAY_SHORT[day.dayPosition] : null;
  const allDone = day.liftCount > 0 && day.loggedCount >= day.liftCount;
  return (
    <Link href={{ pathname: '/workout/[dayId]', params: { dayId: day.id } }} asChild>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${day.dayLabel}`}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: day.isToday ? t.accent : t.border, backgroundColor: day.isToday ? t.accentSoft : t.card }}>
          <View style={{ width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: day.isToday ? t.accent : t.accentSoft }}>
            <AppText style={{ fontWeight: '800', textTransform: 'uppercase', fontSize: 12, color: day.isToday ? t.accentForeground : t.accent }}>{weekday ?? '·'}</AppText>
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <AppText style={{ fontWeight: '700', flexShrink: 1 }} numberOfLines={1}>{day.dayLabel}</AppText>
              {day.isToday ? (
                <View style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 1 }}>
                  <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '700', fontSize: 11 }}>Today</AppText>
                </View>
              ) : null}
            </View>
            {day.highlights.length ? <AppText variant="small" color="muted" numberOfLines={1}>{day.highlights.join(' · ')}</AppText> : null}
            <AppText variant="small" color="muted">
              {day.exerciseCount} exercise{day.exerciseCount === 1 ? '' : 's'}
              {day.loggedCount > 0 && !allDone ? <AppText variant="small" color="accent" style={{ fontWeight: '600' }}> · {day.loggedCount}/{day.liftCount} logged</AppText> : null}
            </AppText>
            {day.phaseLabel ? <AppText variant="small" color="accent">{day.phaseLabel}</AppText> : null}
          </View>
          {allDone || (day.done && day.liftCount === 0) ? <AppText style={{ color: t.success, fontSize: 20 }}>✓</AppText> : <AppText color="muted">›</AppText>}
        </View>
      </Pressable>
    </Link>
  );
}

// ---------- the open day ----------
function Pill({ children }: { children: React.ReactNode }) {
  const t = useTheme();
  return <View style={{ backgroundColor: t.cardMuted, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>{children}</View>;
}

function RestTimer({ seconds }: { seconds: number }) {
  const [remaining, setRemaining] = useState(seconds);
  useEffect(() => {
    const id = setInterval(() => setRemaining((r) => (r <= 1 ? 0 : r - 1)), 1000);
    return () => clearInterval(id);
  }, []);
  if (remaining <= 0) return null;
  return <AppText variant="small" color="accent" style={{ fontWeight: '600' }}>Rest: {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}</AppText>;
}

function NumberBox({ label, value, onChange, keyboard = 'decimal-pad', placeholder }: { label: string; value: string; onChange: (v: string) => void; keyboard?: 'decimal-pad' | 'numbers-and-punctuation'; placeholder?: string }) {
  return (
    <View style={{ flex: 1 }}>
      <TextField label={label} value={value} onChangeText={onChange} keyboardType={keyboard} placeholder={placeholder} selectTextOnFocus />
    </View>
  );
}

// The boxes for one set: whatever the exercise records (reps, weight, time, distance, calories) and then RPE. Used by the form that logs a
// set and by the sheet that corrects one. `showLoad` is false for a no-weight exercise that has not had a weight added.
function SetBoxes({ tracking, inputs, onChange, showLoad = true }: { tracking: TrackingType; inputs: SetInputs; onChange: (next: SetInputs) => void; showLoad?: boolean }) {
  const set = (key: keyof SetInputs) => (v: string) => onChange({ ...inputs, [key]: v });
  return (
    <View style={{ flexDirection: 'row', gap: spacing.sm }}>
      {hasMeasure(tracking, 'reps') ? <NumberBox label="Reps" value={inputs.reps} onChange={set('reps')} /> : null}
      {hasMeasure(tracking, 'weight') && showLoad ? <NumberBox label="Load (kg)" value={inputs.load} onChange={set('load')} /> : null}
      {hasMeasure(tracking, 'time') ? <NumberBox label="Time" value={inputs.time} onChange={set('time')} keyboard="numbers-and-punctuation" placeholder="m:ss" /> : null}
      {hasMeasure(tracking, 'distance') ? <NumberBox label="Distance (m)" value={inputs.distance} onChange={set('distance')} keyboard="numbers-and-punctuation" placeholder="m or km" /> : null}
      {hasMeasure(tracking, 'calories') ? <NumberBox label="Calories" value={inputs.calories} onChange={set('calories')} /> : null}
      <NumberBox label="RPE" value={inputs.rpe} onChange={set('rpe')} />
    </View>
  );
}

function LogSetForm({
  tracking, setNumber, totalSets, restSeconds, seed, lastSet, priorBest, weightless, onLog,
}: {
  // What the exercise records (reps and weight, a time, a distance, calories, or just done).
  tracking: TrackingType;
  setNumber: number; totalSets: number | null; restSeconds: number | null;
  // The set the boxes start from: the last one logged today, else the first of last time.
  seed: LogValues | null;
  lastSet: LogValues | null; priorBest: number | null;
  // An exercise with no weight: reps and RPE only, and a set can be logged as simply done.
  weightless: boolean;
  onLog: (v: SetValues) => void;
}) {
  const t = useTheme();
  // The numbers carry over between sets (they are usually the same), so after logging only RPE is cleared.
  const [inputs, setInputs] = useState<SetInputs>(() => inputsFromLog(tracking, seed));
  const [timerKey, setTimerKey] = useState(0);
  const [showLoad, setShowLoad] = useState(!weightless);
  const [message, setMessage] = useState<string | null>(null);

  const draft = readSetInputs(tracking, inputs);
  const blank = draft.ok && isBlankSet(tracking, draft.values);

  function submit() {
    if (!draft.ok) {
      setMessage(draft.error);
      return;
    }
    const v = draft.values;
    // A set with nothing recorded says nothing; it used to be saved anyway and counted as a set done (L4).
    if (!weightless && isBlankSet(tracking, v)) {
      setMessage(blankSetMessage(tracking));
      return;
    }
    onLog(v);
    setMessage(isNewBest(v.load, priorBest) ? `Set ${setNumber} logged. New best! 🏆` : `Set ${setNumber} logged`);
    setInputs((p) => ({ ...p, rpe: '' }));
    if (restSeconds != null) setTimerKey((k) => k + 1);
  }

  return (
    <View style={{ backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText style={{ fontWeight: '700' }}>Set {setNumber}{totalSets ? <AppText color="muted"> of {totalSets}</AppText> : null}</AppText>
        {lastSet && tracking !== 'tick' && hasRecordedValue(tracking, lastSet) ? (
          <View style={{ backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <AppText variant="small" color="accent" style={{ fontWeight: '600' }}>Last: {setSummary(tracking, lastSet)}</AppText>
          </View>
        ) : null}
      </View>
      <SetBoxes tracking={tracking} inputs={inputs} onChange={setInputs} showLoad={showLoad} />
      {!showLoad ? <Pressable onPress={() => setShowLoad(true)} accessibilityRole="button"><AppText variant="small" color="accent" style={{ fontWeight: '700' }}>+ Add weight</AppText></Pressable> : null}
      <Button title={tracking === 'tick' || (weightless && blank) ? `Done: set ${setNumber}` : `Log set ${setNumber}`} onPress={submit} />
      {message ? <AppText variant="small" color="success" style={{ fontWeight: '600' }}>{message}</AppText> : null}
      {restSeconds != null && timerKey > 0 ? <RestTimer key={timerKey} seconds={restSeconds} /> : null}
    </View>
  );
}

export function ExerciseCard({
  exercise, index, tz, library, resolvedMax, logs, last, priorBest, onLog, onEditSet,
}: {
  exercise: WorkoutExerciseRow;
  index: number;
  tz: string;
  library: Pick<ExerciseLibraryRow, 'video_url'> | undefined;
  resolvedMax: ResolvedMax | null;
  logs: WorkoutLogRow[];
  last: LastSession<WorkoutLogRow> | null;
  priorBest: number | null;
  onLog: (exercise: WorkoutExerciseRow, setNumber: number, v: SetValues) => void;
  onEditSet: (log: WorkoutLogRow, index: number) => void;
}) {
  const t = useTheme();
  // Warm-up exercises are not logged one by one: the whole warm-up gets a single tick (WarmupTick).
  const isWarmup = exercise.section === 'warmup' && exercise.block_type === 'exercise';
  const isCircuit = exercise.block_type === 'circuit';
  const tracking = trackingOf(exercise.tracking_type);
  const weightless = tracking === 'weight_reps' && isWeightless(exercise, priorBest, logs.map((l) => l.actual_load));
  const isPercent = exercise.prescription_type === 'percent_1rm';
  const kg = isPercent ? percentOfMaxKg(resolvedMax, exercise.percent_1rm) : null;
  const videoUrl = exercise.video_url || library?.video_url || null;
  const seed = logs.length > 0 ? logs[logs.length - 1] : (last?.sets[0] ?? null);
  // After the HIGHEST set logged, not "how many are logged plus one": after deleting set 2 of three, the old rule handed out 3 again and the
  // member had two sets numbered 3 (L4).
  const setNumber = nextSetNumber(logs);
  // The day shown is the member's own calendar day for that session, not the phone's.
  const when = last ? new Date(last.loggedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: tz }) : '';

  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'flex-start' }}>
        <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppText variant="small" color="accent" style={{ fontWeight: '800' }}>{index + 1}</AppText>
        </View>
        <View style={{ flex: 1, gap: 6 }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>{exercise.name}</AppText>
          {!isCircuit ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {exercise.sets != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.sets}</AppText> sets</AppText></Pill> : null}
              {hasMeasure(tracking, 'reps') && exercise.reps != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.reps}</AppText> reps</AppText></Pill> : null}
              {hasMeasure(tracking, 'time') && exercise.target_seconds != null ? <Pill><AppText variant="small" style={{ fontWeight: '800' }}>{formatDuration(exercise.target_seconds)}</AppText></Pill> : null}
              {hasMeasure(tracking, 'distance') && exercise.target_distance != null ? <Pill><AppText variant="small" style={{ fontWeight: '800' }}>{formatDistance(exercise.target_distance)}</AppText></Pill> : null}
              {hasMeasure(tracking, 'calories') && exercise.target_calories != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.target_calories}</AppText> cal</AppText></Pill> : null}
              {hasMeasure(tracking, 'weight') ? (isPercent ? (exercise.percent_1rm != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.percent_1rm}%</AppText> 1RM</AppText></Pill> : null) : exercise.load != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.load}</AppText> kg</AppText></Pill> : null) : null}
              {exercise.rpe != null ? <Pill><AppText variant="small">RPE <AppText variant="small" style={{ fontWeight: '800' }}>{exercise.rpe}</AppText></AppText></Pill> : null}
            </View>
          ) : null}
          {kg != null ? <AppText variant="small" color="muted">≈ {kg} kg</AppText> : null}
          {isPercent && kg == null ? <AppText variant="small" color="muted">Record a tested max to see your target weight.</AppText> : null}
        </View>
      </View>

      {exercise.notes && !isCircuit ? <AppText color="muted">{exercise.notes}</AppText> : null}
      {isCircuit && exercise.notes ? <View style={{ backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm }}><AppText color="muted">{exercise.notes}</AppText></View> : null}
      {safeHttpUrl(videoUrl) ? (
        <Pressable onPress={() => void Linking.openURL(safeHttpUrl(videoUrl) as string).catch(() => {})} accessibilityRole="link"><AppText variant="small" color="accent" style={{ fontWeight: '600' }}>▶ Watch demo ↗</AppText></Pressable>
      ) : null}

      {last && !isWarmup ? (
        <View style={{ gap: 4 }}>
          <AppText variant="small" color="accent" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 }}>{last.label} · {when}</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {last.sets.map((l, i) => (
              <View key={l.id} style={{ borderWidth: 1, borderColor: i === logs.length ? t.accent : t.border, backgroundColor: i === logs.length ? t.accentSoft : 'transparent', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                <AppText variant="small" style={{ fontWeight: '600' }}>{i + 1} · {setSummary(tracking, l)}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {!isCircuit && !isWarmup ? (
        <>
          {logs.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {logs.map((l, i) => (
                <Pressable key={l.id} onPress={() => onEditSet(l, i + 1)} accessibilityLabel={`Edit set ${i + 1}`} style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <AppText variant="small" color="success" style={{ fontWeight: '700' }}>✓ {i + 1} · {weightless && l.actual_load == null ? (l.actual_reps ?? 'done') : setSummary(tracking, l, true)}{isNewBest(l.actual_load, priorBest) ? ' 🏆' : ''}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <LogSetForm
            tracking={tracking}
            setNumber={setNumber}
            totalSets={Number(exercise.sets) > 0 ? Number(exercise.sets) : null}
            restSeconds={exercise.rest_seconds}
            seed={seed}
            lastSet={last ? lastLogFor(last, setNumber) : null}
            priorBest={priorBest}
            weightless={weightless}
            onLog={(v) => onLog(exercise, setNumber, v)}
          />
        </>
      ) : null}
    </Card>
  );
}

// A titled block (Warm-up, Lift, Strong · Block 1 · AMRAP ...) with its exercises, supersets grouped.
// One tick for the whole warm-up (not one per exercise).
export function WarmupTick({ done, onToggle }: { done: boolean; onToggle: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onToggle}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: done }}
      accessibilityLabel="Warm-up done"
      style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm, minHeight: 48 }}>
      <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: done ? t.success : t.border, backgroundColor: done ? t.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
        {done ? <AppText style={{ color: '#fff', fontWeight: '800' }}>✓</AppText> : null}
      </View>
      <AppText style={{ fontWeight: '700' }}>{done ? 'Warm-up done' : 'Tick when your warm-up is done'}</AppText>
    </Pressable>
  );
}

export function BlockView({ block, renderExercise, headerExtra, footer }: { block: DisplayBlock<WorkoutExerciseRow>; renderExercise: (ex: WorkoutExerciseRow, index: number) => React.ReactNode; headerExtra?: React.ReactNode; footer?: React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {block.title ? (
        <View>
          <AppText style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: t.accentText }}>{block.title}</AppText>
          {block.description ? <AppText variant="small" color="muted">{block.description}</AppText> : null}
        </View>
      ) : null}
      {headerExtra}
      {groupBySuperset(block.rows).map((sg, gi) => (
        <View key={gi} style={sg.group ? { gap: spacing.sm, borderLeftWidth: 3, borderLeftColor: t.accent, paddingLeft: spacing.sm } : { gap: spacing.sm }}>
          {sg.group ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: t.accent, alignItems: 'center', justifyContent: 'center' }}>
                <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '700', fontSize: 11 }}>{sg.group}</AppText>
              </View>
              <AppText variant="small" color="accent" style={{ fontWeight: '600', textTransform: 'uppercase' }}>Superset</AppText>
              {sg.exercises.length >= 2 && sg.exercises.every((e) => e.block_type === 'exercise') ? <AppText variant="small" color="muted">· alternate {sg.exercises.map((_, i) => i + 1).join(' → ')}</AppText> : null}
            </View>
          ) : null}
          {sg.exercises.map((ex) => renderExercise(ex, block.rows.findIndex((e) => e.id === ex.id)))}
        </View>
      ))}
      {footer}
    </View>
  );
}

// ---------- what the member scored on a block ----------
// Rounds and reps, a finish time, a score or a tick, saved once for the block and shown under its exercises.
export function BlockResultForm({ config, result, onSave, onClear }: { config: BlockConfig; result: WorkoutBlockResultRow | undefined; onSave: (v: ResultValues) => void; onClear: () => void }) {
  const t = useTheme();
  const [inputs, setInputs] = useState<ResultInputs>(() => inputsFromResult(result));
  const [message, setMessage] = useState<string | null>(null);
  if (config.scoring === 'none') return null;
  const scoring = config.scoring;

  function save() {
    const read = readResultInputs(scoring, inputs);
    if (!read.ok) {
      setMessage(read.error);
      return;
    }
    if (isBlankResult(scoring, read.values)) {
      setMessage('Add your result before saving it.');
      return;
    }
    onSave(read.values);
    setMessage('Result saved');
  }

  const box = (f: ResultField) =>
    f === 'done' ? (
      <Pressable
        key={f}
        onPress={() => setInputs((p) => ({ ...p, done: !p.done }))}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: inputs.done }}
        accessibilityLabel={resultLabel('done', config)}
        style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, minHeight: 48 }}>
        <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: inputs.done ? t.success : t.border, backgroundColor: inputs.done ? t.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
          {inputs.done ? <AppText style={{ color: '#fff', fontWeight: '800' }}>✓</AppText> : null}
        </View>
        <AppText style={{ fontWeight: '700' }}>{resultLabel('done', config)}</AppText>
      </Pressable>
    ) : (
      <NumberBox
        key={f}
        label={resultLabel(f, config)}
        value={inputs[f]}
        onChange={(v) => setInputs((p) => ({ ...p, [f]: v }))}
        keyboard={f === 'time' ? 'numbers-and-punctuation' : 'decimal-pad'}
        placeholder={f === 'time' ? 'm:ss' : undefined}
      />
    );

  return (
    <View style={{ backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText style={{ fontWeight: '700' }}>Block result</AppText>
        {result ? (
          <View style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <AppText variant="small" color="success" style={{ fontWeight: '700' }}>✓ {resultSummary(config, result)}</AppText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>{resultFields(scoring).map(box)}</View>
      <Button title={result ? 'Update result' : 'Save result'} onPress={save} />
      {message ? <AppText variant="small" color="success" style={{ fontWeight: '600' }}>{message}</AppText> : null}
      {result ? (
        <Pressable onPress={() => { onClear(); setInputs(inputsFromResult(undefined)); setMessage(null); }} accessibilityRole="button">
          <AppText variant="small" color="danger" style={{ fontWeight: '700' }}>Remove result</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// ---------- editing a logged set ----------
export function SetEditSheet({ log, index, tracking, onSave, onDelete, onClose }: { log: WorkoutLogRow; index: number; tracking: TrackingType; onSave: (v: SetValues) => void; onDelete: () => void; onClose: () => void }) {
  const [inputs, setInputs] = useState<SetInputs>(() => ({ ...inputsFromLog(tracking, log), rpe: log.actual_rpe != null ? String(log.actual_rpe) : '' }));
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <SheetFrame title={`Edit set ${index}`} onClose={onClose}>
      <SetBoxes tracking={tracking} inputs={inputs} onChange={setInputs} />
      {error ? <AppText color="danger">{error}</AppText> : null}
      <Button
        title="Save changes"
        onPress={() => {
          const read = readSetInputs(tracking, inputs);
          if (!read.ok) setError(read.error);
          else onSave(read.values);
        }}
      />
      <Button title={confirming ? 'Tap again to delete this set' : 'Delete this set'} variant="secondary" onPress={() => (confirming ? onDelete() : setConfirming(true))} />
    </SheetFrame>
  );
}

// ---------- rate the session ----------
export function FeedbackForm({ initialRpe, initialNotes, saving, saved, onSave }: { initialRpe: number | null; initialNotes: string | null; saving: boolean; saved: boolean; onSave: (rpe: number | null, notes: string | null) => void }) {
  const [rpe, setRpe] = useState<number | null>(initialRpe);
  const [notes, setNotes] = useState(initialNotes ?? '');
  const hadRating = initialRpe != null || !!initialNotes;
  return (
    <Card style={{ gap: spacing.sm }}>
      <AppText variant="heading">{hadRating ? 'Update rating' : 'Rate this session'}</AppText>
      <AppText variant="small" color="muted">How hard was it overall? 1 is easy, 10 is all out.</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {Array.from({ length: 10 }, (_, i) => i + 1).map((v) => <Chip key={v} label={String(v)} active={rpe === v} onPress={() => setRpe(v)} />)}
      </View>
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline />
      <Button title={saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'} loading={saving} onPress={() => onSave(rpe, notes.trim() || null)} />
    </Card>
  );
}

// ---------- record a tested max ----------
export function RecordMaxSheet({ library, saving, error, onSave, onClose }: { library: { id: string; name: string }[]; saving: boolean; error: string | null; onSave: (v: { exerciseLibraryId: string; testedMax: number; reps: number; isEstimated: boolean }) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [weight, setWeight] = useState('');
  const [reps, setReps] = useState('1');
  const [estimated, setEstimated] = useState(false);
  const matches = library.filter((l) => l.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 30);
  const w = parseQuantity(weight);
  const r = Math.max(1, Math.round(parseQuantity(reps)) || 1);
  return (
    <SheetFrame title="Record a tested max" onClose={onClose}>
      {!picked ? (
        <>
          <TextField label="Exercise" value={query} onChangeText={setQuery} placeholder="e.g. squat" autoCapitalize="none" />
          <ScrollView keyboardShouldPersistTaps="handled" style={{ flex: 1 }}>
            {matches.map((l) => (
              <Pressable key={l.id} onPress={() => setPicked(l)} style={{ paddingVertical: 12 }}><AppText>{l.name}</AppText></Pressable>
            ))}
            {matches.length === 0 ? <AppText color="muted">No exercises match.</AppText> : null}
          </ScrollView>
        </>
      ) : (
        <>
          <AppText variant="heading">{picked.name}</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <NumberBox label="Weight (kg)" value={weight} onChange={setWeight} />
            <NumberBox label="Reps" value={reps} onChange={setReps} />
          </View>
          <AppText variant="small" color="muted">1 rep = a true 1RM. More than 1 (a 3 or 5 rep max) is converted to an estimated 1RM automatically.</AppText>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <Chip label={estimated ? 'Estimated ✓' : 'Estimated'} active={estimated} onPress={() => setEstimated((v) => !v)} />
          </View>
          {error ? <AppText color="danger">{error}</AppText> : null}
          <Button title="Save" loading={saving} disabled={!(w > 0)} onPress={() => onSave({ exerciseLibraryId: picked.id, testedMax: w, reps: r, isEstimated: estimated })} />
          <SmallButton title="Choose a different exercise" tone="muted" onPress={() => setPicked(null)} />
        </>
      )}
    </SheetFrame>
  );
}
