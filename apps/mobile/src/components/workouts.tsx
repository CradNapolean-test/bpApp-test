import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Linking, ScrollView, View } from 'react-native';

import type { ExerciseLibraryRow, WorkoutExerciseRow, WorkoutLogRow } from '@ballistic/shared/data/types';
import { WEEKDAY_SHORT } from '@ballistic/shared/utils/dates';
import { groupBySuperset } from '@ballistic/shared/utils/exerciseGrouping';
import { percentOfMaxKg, type ResolvedMax } from '@ballistic/shared/utils/oneRepMax';
import type { DaySummary } from '@ballistic/shared/utils/programOverview';
import type { DisplayBlock } from '@ballistic/shared/utils/workoutDisplay';
import { isNewBest, lastSetFor, type LastSession } from '@ballistic/shared/utils/workoutHistory';
import { isEmptySet, nextSetNumber } from '@ballistic/shared/utils/workoutSets';
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

function NumberBox({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <View style={{ flex: 1 }}>
      <TextField label={label} value={value} onChangeText={onChange} keyboardType="decimal-pad" selectTextOnFocus />
    </View>
  );
}

function LogSetForm({
  setNumber, totalSets, restSeconds, initialReps, initialLoad, lastSet, priorBest, onLog,
}: {
  setNumber: number; totalSets: number | null; restSeconds: number | null; initialReps: number | null; initialLoad: number | null;
  lastSet: { reps: number | null; load: number | null } | null; priorBest: number | null;
  onLog: (v: { reps: number | null; load: number | null; rpe: number | null }) => void;
}) {
  const t = useTheme();
  // Reps and load carry over between sets (they are usually the same), so after logging only RPE is cleared.
  const [reps, setReps] = useState(initialReps != null ? String(initialReps) : '');
  const [load, setLoad] = useState(initialLoad != null ? String(initialLoad) : '');
  const [rpe, setRpe] = useState('');
  const [timerKey, setTimerKey] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const n = (s: string) => (s.trim() === '' ? null : parseQuantity(s));

  function submit() {
    const loadN = n(load);
    // A set with no reps, no load and no RPE says nothing; it used to be saved and counted as a set done (L4).
    if (isEmptySet({ reps: n(reps), load: loadN, rpe: n(rpe) })) {
      setMessage('Add the reps, the load or your RPE to log this set.');
      return;
    }
    onLog({ reps: n(reps), load: loadN, rpe: n(rpe) });
    setMessage(isNewBest(loadN, priorBest) ? `Set ${setNumber} logged. New best! 🏆` : `Set ${setNumber} logged`);
    setRpe('');
    if (restSeconds != null) setTimerKey((k) => k + 1);
  }

  return (
    <View style={{ backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm, gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <AppText style={{ fontWeight: '700' }}>Set {setNumber}{totalSets ? <AppText color="muted"> of {totalSets}</AppText> : null}</AppText>
        {lastSet && (lastSet.reps != null || lastSet.load != null) ? (
          <View style={{ backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 2 }}>
            <AppText variant="small" color="accent" style={{ fontWeight: '600' }}>Last: {lastSet.reps ?? '—'} × {lastSet.load ?? '—'}</AppText>
          </View>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <NumberBox label="Reps" value={reps} onChange={setReps} />
        <NumberBox label="Load (kg)" value={load} onChange={setLoad} />
        <NumberBox label="RPE" value={rpe} onChange={setRpe} />
      </View>
      <Button title={`Log set ${setNumber}`} onPress={submit} />
      {message ? <AppText variant="small" color="success" style={{ fontWeight: '600' }}>{message}</AppText> : null}
      {restSeconds != null && timerKey > 0 ? <RestTimer key={timerKey} seconds={restSeconds} /> : null}
    </View>
  );
}

export function ExerciseCard({
  exercise, index, tz, library, resolvedMax, logs, last, priorBest, onLog, onEditSet, onTickWarmup, onUntickWarmup,
}: {
  exercise: WorkoutExerciseRow;
  index: number;
  tz: string;
  library: Pick<ExerciseLibraryRow, 'video_url'> | undefined;
  resolvedMax: ResolvedMax | null;
  logs: WorkoutLogRow[];
  last: LastSession<WorkoutLogRow> | null;
  priorBest: number | null;
  onLog: (exercise: WorkoutExerciseRow, setNumber: number, v: { reps: number | null; load: number | null; rpe: number | null }) => void;
  onEditSet: (log: WorkoutLogRow, index: number) => void;
  // Warm-up exercises are ticked off instead of logged as sets, reps and weight.
  onTickWarmup: (exercise: WorkoutExerciseRow) => void;
  onUntickWarmup: (logs: WorkoutLogRow[]) => void;
}) {
  const t = useTheme();
  const isWarmup = exercise.section === 'warmup' && exercise.block_type === 'exercise';
  const isCircuit = exercise.block_type === 'circuit';
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
              {exercise.reps != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.reps}</AppText> reps</AppText></Pill> : null}
              {isPercent ? (exercise.percent_1rm != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.percent_1rm}%</AppText> 1RM</AppText></Pill> : null) : exercise.load != null ? <Pill><AppText variant="small"><AppText variant="small" style={{ fontWeight: '800' }}>{exercise.load}</AppText> kg</AppText></Pill> : null}
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
                <AppText variant="small" style={{ fontWeight: '600' }}>{i + 1} · {l.actual_reps ?? '—'} × {l.actual_load ?? '—'}</AppText>
              </View>
            ))}
          </View>
        </View>
      ) : null}

      {isWarmup ? (
        <Pressable
          onPress={() => (logs.length > 0 ? onUntickWarmup(logs) : onTickWarmup(exercise))}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: logs.length > 0 }}
          accessibilityLabel={`${exercise.name} done`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: t.cardMuted, borderRadius: radius.md, padding: spacing.sm, minHeight: 48 }}>
          <View style={{ width: 28, height: 28, borderRadius: 8, borderWidth: 2, borderColor: logs.length > 0 ? t.success : t.border, backgroundColor: logs.length > 0 ? t.success : 'transparent', alignItems: 'center', justifyContent: 'center' }}>
            {logs.length > 0 ? <AppText style={{ color: '#fff', fontWeight: '800' }}>✓</AppText> : null}
          </View>
          <AppText style={{ fontWeight: '700' }}>{logs.length > 0 ? 'Done' : 'Tick when done'}</AppText>
        </Pressable>
      ) : null}

      {!isCircuit && !isWarmup ? (
        <>
          {logs.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {logs.map((l, i) => (
                <Pressable key={l.id} onPress={() => onEditSet(l, i + 1)} accessibilityLabel={`Edit set ${i + 1}`} style={{ backgroundColor: 'rgba(16,185,129,0.12)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                  <AppText variant="small" color="success" style={{ fontWeight: '700' }}>✓ {i + 1} · {l.actual_reps ?? '—'}×{l.actual_load ?? '—'}{isNewBest(l.actual_load, priorBest) ? ' 🏆' : ''}</AppText>
                </Pressable>
              ))}
            </View>
          ) : null}
          <LogSetForm
            setNumber={setNumber}
            totalSets={Number(exercise.sets) > 0 ? Number(exercise.sets) : null}
            restSeconds={exercise.rest_seconds}
            initialReps={seed?.actual_reps ?? null}
            initialLoad={seed?.actual_load ?? null}
            lastSet={last ? lastSetFor(last, setNumber) : null}
            priorBest={priorBest}
            onLog={(v) => onLog(exercise, setNumber, v)}
          />
        </>
      ) : null}
    </Card>
  );
}

// A titled block (Warm-up, Lift, Strong · Block 1 · AMRAP ...) with its exercises, supersets grouped.
export function BlockView({ block, renderExercise }: { block: DisplayBlock<WorkoutExerciseRow>; renderExercise: (ex: WorkoutExerciseRow, index: number) => React.ReactNode }) {
  const t = useTheme();
  return (
    <View style={{ gap: spacing.sm }}>
      {block.title ? (
        <View>
          <AppText style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8, color: t.accentText }}>{block.title}</AppText>
          {block.description ? <AppText variant="small" color="muted">{block.description}</AppText> : null}
        </View>
      ) : null}
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
    </View>
  );
}

// ---------- editing a logged set ----------
export function SetEditSheet({ log, index, onSave, onDelete, onClose }: { log: WorkoutLogRow; index: number; onSave: (v: { reps: number | null; load: number | null; rpe: number | null }) => void; onDelete: () => void; onClose: () => void }) {
  const [reps, setReps] = useState(log.actual_reps != null ? String(log.actual_reps) : '');
  const [load, setLoad] = useState(log.actual_load != null ? String(log.actual_load) : '');
  const [rpe, setRpe] = useState(log.actual_rpe != null ? String(log.actual_rpe) : '');
  const [confirming, setConfirming] = useState(false);
  const n = (s: string) => (s.trim() === '' ? null : parseQuantity(s));
  return (
    <SheetFrame title={`Edit set ${index}`} onClose={onClose}>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <NumberBox label="Reps" value={reps} onChange={setReps} />
        <NumberBox label="Load (kg)" value={load} onChange={setLoad} />
        <NumberBox label="RPE" value={rpe} onChange={setRpe} />
      </View>
      <Button title="Save changes" onPress={() => onSave({ reps: n(reps), load: n(load), rpe: n(rpe) })} />
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
