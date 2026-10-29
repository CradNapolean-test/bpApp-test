import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { bigDogCount, EXERCISES, genderFromProfile, nextTierLabel, TIER_TITLE, tierForCount } from '@ballistic/shared/bigDog';
import { normalizeGender } from '@ballistic/shared/utils/personalDetails';

import { ExerciseCard, ScoreSheet, TierScale } from '@/components/bigdog';
import { AppText, Button, Card, Screen, ScrollScreen } from '@/components/ui';
import { useBigDogResults } from '@/lib/bigDog';
import { useClientProfile } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// Big Dog standards: the T-shirt tier, every exercise with its Rookie / Strong / Big Dog targets for the member's sex, and a
// way to log a score. Only coach-verified scores count towards a shirt; the member's own show as "awaiting coach check".
export default function BigDog() {
  const t = useTheme();
  const q = useBigDogResults();
  const profile = useClientProfile().data ?? null;
  const gender = genderFromProfile(normalizeGender(profile?.gender) ?? undefined);
  const [sheetFor, setSheetFor] = useState<string | null>(null);

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
        <AppText color="danger">Could not load your scores: {q.error.message}</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }

  const results = q.data;
  const count = bigDogCount(results);
  const sheetExercise = EXERCISES.find((e) => e.key === sheetFor) ?? null;
  return (
    <>
      <ScrollScreen refreshing={q.isRefetching} onRefresh={() => q.refetch()}>
        <Card style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderColor: t.accentBorder }}>
          <View style={{ flex: 1 }}>
            <AppText style={{ fontWeight: '800', fontSize: 17 }}>{TIER_TITLE[tierForCount(count)]}</AppText>
            <AppText variant="small" color="muted">{nextTierLabel(count)}</AppText>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <AppText color="accent" style={{ fontSize: 26, fontWeight: '900', lineHeight: 28 }}>{count}</AppText>
            <AppText variant="small" color="muted">of {EXERCISES.length} BD</AppText>
          </View>
        </Card>

        <TierScale count={count} />

        <View style={{ gap: 4 }}>
          <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>All exercises</AppText>
          <AppText variant="small" color="muted">
            Targets for {gender === 'male' ? 'men' : 'women'}{!profile?.gender ? ' · set your sex in Personal details' : ''}. Tap Log score to record your peak week score.
          </AppText>
        </View>

        <View style={{ gap: spacing.sm }}>
          {EXERCISES.map((ex) => <ExerciseCard key={ex.key} exercise={ex} gender={gender} results={results} onLog={() => setSheetFor(ex.key)} />)}
        </View>
      </ScrollScreen>
      {sheetExercise ? <ScoreSheet exercise={sheetExercise} gender={gender} results={results} onClose={() => setSheetFor(null)} /> : null}
    </>
  );
}
