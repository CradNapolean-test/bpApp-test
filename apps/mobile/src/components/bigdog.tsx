import { useState } from 'react';
import { Pressable, View } from 'react-native';

import {
  bestResult,
  currentLevels,
  EXERCISES,
  showStandard,
  formatResult,
  LEVEL_LABEL,
  levelForResult,
  levelRank,
  nextTarget,
  nextTierLabel,
  parseResultInput,
  TIER_THRESHOLDS,
  TIER_TITLE,
  tierForCount,
  type BigDogExercise,
  type BigDogGender,
  type BigDogLevel,
  type BigDogTier,
} from '@ballistic/shared/bigDog';
import type { BigDogResultRow } from '@ballistic/shared/data/types';

import { Input } from '@/components/fields';
import { Icon } from '@/components/icons';
import { AppText, Button, SheetFrame } from '@/components/ui';
import { useDeleteScore, useLogScore } from '@/lib/bigDog';
import { radius, spacing, useTheme } from '@/theme';

const fmtDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

type Zone = { tier: Exclude<BigDogTier, 'none'>; label: string; from: number; fill: string; faint: string };

// The T-shirt ladder: one pip per exercise, tinted by the tier that pip belongs to, with each tier's name under the pip where it
// starts (White at 1, Turquoise at 3, Silver at 6, Gold at all of them). Pips fill as exercises reach Big Dog.
// `compact` is the thin strip on the profile card: no "3+" line under each name.
export function TierScale({ count, compact = false }: { count: number; compact?: boolean }) {
  const t = useTheme();
  const total = EXERCISES.length;
  const zones: Zone[] = [
    { tier: 'white', label: 'White', from: TIER_THRESHOLDS.white, fill: '#e4e4e7', faint: 'rgba(212,212,216,0.35)' },
    { tier: 'turquoise', label: 'Turquoise', from: TIER_THRESHOLDS.turquoise, fill: t.accent, faint: 'rgba(25,173,177,0.3)' },
    { tier: 'silver', label: 'Silver', from: TIER_THRESHOLDS.silver, fill: '#a1a1aa', faint: 'rgba(161,161,170,0.3)' },
    { tier: 'gold', label: 'Gold', from: TIER_THRESHOLDS.gold, fill: '#f59e0b', faint: 'rgba(245,158,11,0.3)' },
  ];
  const zoneOf = (n: number) => [...zones].reverse().find((z) => n >= z.from) ?? zones[0];
  return (
    <View accessibilityLabel={`${count} of ${total} Big Dog standards reached`}>
      <View style={{ flexDirection: 'row', gap: compact ? 4 : 3 }}>
        {Array.from({ length: total }, (_, i) => {
          const z = zoneOf(i + 1);
          return <View key={i} style={{ flex: 1, height: compact ? 4 : 10, borderRadius: compact ? 2 : 5, backgroundColor: i < count ? z.fill : z.faint }} />;
        })}
      </View>
      <View style={{ height: compact ? 16 : 34, marginTop: 6 }}>
        {zones.map((z, i) => {
          const reached = count >= z.from;
          const last = i === zones.length - 1;
          const left = `${((z.from - 1) / total) * 100}%` as const;
          return (
            <View key={z.tier} style={last ? { position: 'absolute', right: 0, alignItems: 'flex-end' } : { position: 'absolute', left }}>
              <AppText style={{ fontSize: compact ? 10 : 11, fontWeight: '800', color: reached ? (compact ? t.accentText : t.foreground) : t.muted }}>{z.label}</AppText>
              {compact ? null : <AppText style={{ fontSize: 11, color: reached ? t.accentText : t.muted }}>{last ? `all ${total}` : `${z.from}+`}</AppText>}
            </View>
          );
        })}
      </View>
    </View>
  );
}

// The profile's summary of the T-shirt tier: where the member is, what is next, and the pips. Tap for every standard.
export function BigDogCard({ count, onPress }: { count: number; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${TIER_TITLE[tierForCount(count)]}. View all Big Dog standards`}
      style={({ pressed }) => ({ borderRadius: radius.lg, padding: spacing.md, gap: spacing.md, borderWidth: 1, borderColor: 'rgba(42,191,191,0.3)', backgroundColor: 'rgba(42,191,191,0.06)', opacity: pressed ? 0.75 : 1 })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppText style={{ fontSize: 18 }}>🐕</AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '800' }}>{TIER_TITLE[tierForCount(count)]}</AppText>
          <AppText variant="small" color="muted">{count} of {EXERCISES.length} · {nextTierLabel(count)}</AppText>
        </View>
        <Icon name="chevronRight" size={18} color={t.accentText} />
      </View>
      <TierScale count={count} compact />
    </Pressable>
  );
}

const LEVEL_BG: Record<BigDogLevel, string> = { big_dog: 'rgba(25,173,177,0.16)', strong: 'rgba(127,127,127,0.18)', rookie: 'rgba(127,127,127,0.12)', none: 'rgba(127,127,127,0.08)' };

export function LevelBadge({ level }: { level: BigDogLevel }) {
  const t = useTheme();
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: LEVEL_BG[level] }}>
      <AppText style={{ fontSize: 11, fontWeight: '800', color: level === 'big_dog' ? t.accent : level === 'none' ? t.muted : t.foreground }}>{LEVEL_LABEL[level]}</AppText>
    </View>
  );
}

// One standard: its three levels for the member's sex, the best score so far, and a Log score button.
export function ExerciseCard({ exercise, gender, results, onLog }: { exercise: BigDogExercise; gender: BigDogGender; results: BigDogResultRow[]; onLog: () => void }) {
  const t = useTheme();
  const std = exercise[gender];
  const mine = results.filter((r) => r.exercise_key === exercise.key);
  const verifiedRow = currentLevels(mine.filter((r) => !r.self_reported))[exercise.key];
  const verifiedLevel: BigDogLevel = verifiedRow?.level ?? 'none';
  const best = bestResult(mine, exercise);
  const bestLevel: BigDogLevel | null = best?.result_value != null ? levelForResult(exercise, gender, best.result_value) : null;
  const effective = bestLevel != null && levelRank(bestLevel) > levelRank(verifiedLevel) ? bestLevel : verifiedLevel;
  const pending = !!best?.self_reported && bestLevel != null && levelRank(bestLevel) > levelRank(verifiedLevel);
  const bestText = best?.result_text ?? (verifiedRow && verifiedLevel !== 'none' ? verifiedRow.result_text : null);
  return (
    <View style={{ borderWidth: 1, borderColor: verifiedLevel === 'big_dog' ? t.accent : t.border, backgroundColor: verifiedLevel === 'big_dog' ? t.accentSoft : t.card, borderRadius: radius.lg, padding: 12, gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '800' }}>{exercise.name}</AppText>
          <AppText variant="small" color="muted">{exercise.category}</AppText>
        </View>
        <LevelBadge level={verifiedLevel} />
      </View>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {([['Rookie', showStandard(exercise.kind, std.rookie), 1], ['Strong', showStandard(exercise.kind, std.strong), 2], ['Big Dog', showStandard(exercise.kind, std.bigDog), 3]] as const).map(([label, value, n]) => {
          const reached = levelRank(verifiedLevel) >= n;
          const tentative = !reached && levelRank(effective) >= n;
          return (
            <View key={label} style={{ flex: 1, borderRadius: 10, borderWidth: 1, borderStyle: tentative ? 'dashed' : 'solid', borderColor: reached ? (n === 3 ? t.accent : t.muted) : tentative ? t.accent : 'transparent', backgroundColor: n === 3 ? 'rgba(25,173,177,0.1)' : t.cardMuted, paddingVertical: 6, paddingHorizontal: 4, alignItems: 'center' }}>
              <AppText style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.4, color: n === 3 ? t.accent : t.muted }}>{label}</AppText>
              <AppText style={{ fontSize: 11, fontWeight: '800', color: n === 3 ? t.accent : t.foreground }} numberOfLines={1}>{value}</AppText>
            </View>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <AppText variant="small" color="muted" style={{ flex: 1 }}>
          {bestText ? (
            <>
              Best <AppText variant="small" style={{ fontWeight: '800' }}>{bestText}</AppText>
              {pending ? <AppText variant="small" color="warning" style={{ fontWeight: '700' }}> · awaiting coach check</AppText> : null}
            </>
          ) : (
            'No score logged yet'
          )}
        </AppText>
        <Pressable onPress={onLog} accessibilityRole="button" accessibilityLabel={`Log a score for ${exercise.name}`} style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 7 }}>
          <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '800' }}>Log score</AppText>
        </Pressable>
      </View>
    </View>
  );
}

// Log a score for one standard: type what you did, see the level it earns and how far the next one is, and look back at earlier
// attempts. The member's own scores can be deleted; the coach confirms them before they count towards a T-shirt.
export function ScoreSheet({ exercise, gender, results, onClose }: { exercise: BigDogExercise; gender: BigDogGender; results: BigDogResultRow[]; onClose: () => void }) {
  const t = useTheme();
  const log = useLogScore(gender);
  const del = useDeleteScore();
  const [text, setText] = useState('');
  const [banded, setBanded] = useState(false);
  const std = exercise[gender];

  const value = exercise.kind === 'reps' && banded ? 0 : parseResultInput(exercise.kind, text);
  const level = value != null ? levelForResult(exercise, gender, value) : null;
  const target = level != null && value != null ? nextTarget(exercise, gender, level, value) : null;

  const history = results.filter((r) => r.exercise_key === exercise.key);
  const best = bestResult(history, exercise);
  const bestLevel = best?.result_value != null ? levelForResult(exercise, gender, best.result_value) : null;
  const unitHint = exercise.kind === 'weight' ? 'kg' : exercise.kind === 'distance' ? 'm' : exercise.kind === 'reps' ? 'reps' : 'm:ss';
  const placeholder = exercise.kind === 'weight' ? 'e.g. 125' : exercise.kind === 'distance' ? 'e.g. 1210' : exercise.kind === 'reps' ? 'e.g. 5' : 'e.g. 8:42';

  function save() {
    if (value == null) return;
    log.mutate({ exerciseKey: exercise.key, value }, { onSuccess: () => { setText(''); setBanded(false); } });
  }

  return (
    <SheetFrame title={exercise.name} onClose={onClose}>
      <AppText variant="small" color="muted" style={{ marginTop: -spacing.sm }}>{exercise.category} · targets for {gender === 'male' ? 'men' : 'women'}</AppText>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {([['Rookie', showStandard(exercise.kind, std.rookie), 'rookie'], ['Strong', showStandard(exercise.kind, std.strong), 'strong'], ['Big Dog', showStandard(exercise.kind, std.bigDog), 'big_dog']] as const).map(([label, v, key]) => (
          <View key={label} style={{ flex: 1, borderWidth: 1, borderColor: bestLevel != null && levelRank(bestLevel) >= levelRank(key) ? t.accent : t.border, backgroundColor: bestLevel != null && levelRank(bestLevel) >= levelRank(key) ? t.accentSoft : 'transparent', borderRadius: 12, paddingVertical: 6, alignItems: 'center' }}>
            <AppText style={{ fontSize: 10, fontWeight: '800', textTransform: 'uppercase', color: t.muted }}>{label}</AppText>
            <AppText style={{ fontSize: 13, fontWeight: '800' }}>{v}</AppText>
          </View>
        ))}
      </View>

      <View style={{ gap: 6 }}>
        <AppText variant="small" style={{ fontWeight: '700' }}>Log a score <AppText variant="small" color="muted">({unitHint})</AppText></AppText>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Input
            accessibilityLabel={`Your score for ${exercise.name}`}
            style={{ flex: 1, fontSize: 18, fontWeight: '800', opacity: banded ? 0.6 : 1 }}
            editable={!banded}
            value={banded ? 'Banded' : text}
            onChangeText={setText}
            placeholder={placeholder}
            keyboardType={exercise.kind === 'time' || exercise.kind === 'hold' ? 'numbers-and-punctuation' : 'decimal-pad'}
            maxLength={12}
          />
          {exercise.kind === 'reps' ? (
            <Pressable onPress={() => setBanded((b) => !b)} accessibilityRole="button" accessibilityState={{ selected: banded }} style={{ borderRadius: radius.md, paddingHorizontal: 16, justifyContent: 'center', backgroundColor: banded ? t.accent : 'transparent', borderWidth: banded ? 0 : 1, borderColor: t.border }}>
              <AppText style={{ fontWeight: '700', color: banded ? t.accentForeground : t.foreground }}>Banded</AppText>
            </Pressable>
          ) : null}
        </View>
      </View>

      {level != null && value != null ? (
        <View style={{ backgroundColor: t.cardMuted, borderRadius: 12, padding: 12, gap: 2 }}>
          <AppText style={{ fontWeight: '700' }}>
            {formatResult(exercise.kind, value)} <AppText color="muted">→</AppText> <AppText color={level === 'big_dog' ? 'accent' : undefined} style={{ fontWeight: '800' }}>{level === 'none' ? 'Below Rookie' : LEVEL_LABEL[level]}</AppText>
          </AppText>
          {target ? <AppText variant="small" color="muted">{target.gap ? `${target.gap} for ${LEVEL_LABEL[target.level]} (${target.label})` : `Next: ${LEVEL_LABEL[target.level]} (${target.label})`}</AppText> : null}
        </View>
      ) : null}

      {log.isError ? <AppText color="danger">{log.error.message}</AppText> : null}
      {log.isSuccess ? <AppText color="success" style={{ fontWeight: '600' }}>Score logged{level === 'big_dog' ? ' — Big Dog! Your coach will check it' : ''}.</AppText> : null}
      <Button title={log.isPending ? 'Saving…' : 'Log score'} onPress={save} loading={log.isPending} disabled={value == null} />
      <AppText variant="small" color="muted" style={{ textAlign: 'center' }}>Your coach confirms scores before they count towards a Big Dog T-shirt.</AppText>

      <View style={{ gap: 6 }}>
        <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>History</AppText>
        {history.length === 0 ? <AppText color="muted">No scores yet.</AppText> : null}
        {history.map((r) => (
          <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
            <View style={{ flex: 1 }}>
              <AppText style={{ fontWeight: '700' }}>{r.result_text ?? LEVEL_LABEL[r.level]}</AppText>
              <AppText variant="small" color="muted">{fmtDate(r.tested_date)} · {r.self_reported ? 'logged by you' : 'verified by coach'}</AppText>
            </View>
            <LevelBadge level={r.level} />
            {r.self_reported ? (
              <Pressable onPress={() => del.mutate({ id: r.id })} accessibilityRole="button" accessibilityLabel="Delete this score" hitSlop={8} style={{ padding: 6 }}>
                <Icon name="trash2" size={16} color={t.muted} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {del.isError ? <AppText color="danger">{del.error.message}</AppText> : null}
      </View>
    </SheetFrame>
  );
}
