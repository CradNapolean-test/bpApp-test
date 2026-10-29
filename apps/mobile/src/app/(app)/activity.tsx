import { useMemo, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { STANDARD_STEP_TARGET } from '@ballistic/shared/calculations';
import { ACTIVITY_CATEGORIES, DEFAULT_MINUTES_PER_1000, swapRows, walkingMinutes, type ActivityCategory } from '@ballistic/shared/utils/activity';

import { AutoSaveInput } from '@/components/checkin';
import { Input } from '@/components/fields';
import { Icon } from '@/components/icons';
import { TrainingTabs } from '@/components/pagetabs';
import { AppText, Button, Card, Chip, Screen, ScrollScreen } from '@/components/ui';
import { useActivities, useSaveMinutesPer1000 } from '@/lib/activity';
import { useClientProfile } from '@/lib/today';
import { radius, spacing, useTheme } from '@/theme';

// The "step swap": can't get your steps in? Each row says how long another activity takes to give the same effort as your step
// target. The maths is the validated equivalentMinutesForActivity; this screen only presents it.
export default function Activity() {
  const t = useTheme();
  const q = useActivities();
  const profile = useClientProfile().data ?? null;
  const save = useSaveMinutesPer1000();
  const saved = profile?.minutes_per_1000_steps ?? null;
  const [minutes, setMinutes] = useState<number>(saved ?? DEFAULT_MINUTES_PER_1000);
  const [stepText, setStepText] = useState(String(STANDARD_STEP_TARGET));
  const [category, setCategory] = useState<ActivityCategory>('All');
  const [query, setQuery] = useState('');

  const steps = Number(stepText.replace(/,/g, '')) || 0;
  const rows = useMemo(() => swapRows(q.data ?? [], steps, minutes || 0, null, category, query), [q.data, steps, minutes, category, query]);

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
        <AppText color="danger">Could not load the activities: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }

  // Typed minutes are remembered on the profile once they stop typing (see AutoSaveInput).
  function saveTyped(text: string) {
    const n = Number(text.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return;
    setMinutes(n);
    if (n !== (saved ?? DEFAULT_MINUTES_PER_1000)) save.mutate(n);
  }

  return (
    <ScrollScreen>
      <TrainingTabs current="activity" />
      <View style={{ borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentSoft, borderRadius: radius.lg, padding: spacing.md, gap: spacing.md }}>
        <View style={{ gap: 4 }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>Can&apos;t get your steps in?</AppText>
          <AppText color="muted">Swap them for another activity. Each row shows how long gives you the same effort as your step target.</AppText>
        </View>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="small" style={{ fontWeight: '700' }}>Minutes per 1,000 steps</AppText>
            <View style={{ backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 10 }}>
              <AutoSaveInput accessibilityLabel="Minutes per 1,000 steps" keyboardType="decimal-pad" display={String(minutes)} editText={String(minutes)} onSave={saveTyped} maxLength={5} selectTextOnFocus style={{ color: t.foreground, fontSize: 18, fontWeight: '700', padding: 0 }} />
            </View>
            <AppText variant="small" color="muted">How long you take to walk 1,000 steps (we&apos;ll remember it)</AppText>
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <AppText variant="small" style={{ fontWeight: '700' }}>Step target</AppText>
            <Input accessibilityLabel="Step target" keyboardType="number-pad" value={stepText} maxLength={6} onChangeText={setStepText} style={{ fontSize: 18, fontWeight: '700' }} />
            <AppText variant="small" color="muted">Our standard daily goal</AppText>
          </View>
        </View>
        {save.isError ? <AppText color="danger">{save.error.message}</AppText> : null}
        <View style={{ backgroundColor: t.card, borderRadius: 12, padding: 12 }}>
          <AppText>
            <AppText style={{ fontWeight: '800' }}>{steps.toLocaleString('en-GB')} steps</AppText> is about <AppText style={{ fontWeight: '800' }}>{walkingMinutes(steps, minutes || 0)} minutes</AppText> of walking.
          </AppText>
        </View>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: t.card, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, paddingHorizontal: spacing.md }}>
        <Icon name="search" size={16} color={t.muted} />
        <Input accessibilityLabel="Search activities" placeholder="Search activities" value={query} onChangeText={setQuery} style={{ flex: 1, borderWidth: 0, paddingHorizontal: 0 }} />
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
        {ACTIVITY_CATEGORIES.map((c) => <Chip key={c} label={c} active={category === c} onPress={() => setCategory(c)} />)}
      </View>

      {rows.length === 0 ? (
        <AppText color="muted" style={{ textAlign: 'center', paddingVertical: spacing.lg }}>No activities match.</AppText>
      ) : (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          {rows.map((row, i) => (
            <View key={row.id} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
              <View style={{ flex: 1 }}>
                <AppText style={{ fontWeight: '800' }}>{row.title}</AppText>
                {row.detail ? <AppText variant="small" color="muted">{row.detail}</AppText> : null}
              </View>
              <AppText>
                <AppText color="accent" style={{ fontSize: 18, fontWeight: '900' }}>{Math.round(row.minutes)}</AppText>
                <AppText variant="small" color="muted" style={{ fontWeight: '700' }}> min</AppText>
              </AppText>
            </View>
          ))}
        </Card>
      )}
    </ScrollScreen>
  );
}
