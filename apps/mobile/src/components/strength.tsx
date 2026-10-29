import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { countsAsWorkingSet, exerciseHistory, formatKg, weeklyVolume } from '@ballistic/shared/utils/trainingStats';

import { TrendChart } from '@/components/charts';
import { Icon } from '@/components/icons';
import { AppText, Card, Chip } from '@/components/ui';
import { useStrengthData, type StrengthLog } from '@/lib/strength';
import { spacing, useTheme } from '@/theme';

const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

// The key a set is grouped under: the library entry when it has one (the same lift in different blocks is one history), else its name.
function keyOf(l: StrengthLog): { key: string; name: string } | null {
  const lib = l.exercise_library_id ?? l.exercise?.exercise_library_id ?? null;
  if (lib) return { key: lib, name: l.exercise?.name ?? 'Exercise' };
  if (l.exercise?.name) return { key: `n:${l.exercise.name.toLowerCase()}`, name: l.exercise.name };
  return null;
}

// Strength under Progress & results: load volume per week (working load x reps), and per-exercise progression with personal bests.
export function StrengthSection({ todayIso, tz }: { todayIso: string; tz: string }) {
  const t = useTheme();
  const q = useStrengthData(todayIso);
  const [picked, setPicked] = useState<string | null>(null);

  const { groups, names, weeks } = useMemo(() => {
    const logs = q.data?.logs ?? [];
    const groups = new Map<string, StrengthLog[]>();
    const names = new Map<string, string>();
    for (const l of logs) {
      if (!countsAsWorkingSet(l)) continue;
      const k = keyOf(l);
      if (!k) continue;
      groups.set(k.key, [...(groups.get(k.key) ?? []), l]);
      if (!names.has(k.key)) names.set(k.key, k.name);
    }
    return { groups, names, weeks: weeklyVolume(logs, todayIso, tz, 12) };
  }, [q.data, todayIso, tz]);

  if (q.isPending) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (q.isError) return <AppText color="danger">Could not load your strength: {q.error.message}</AppText>;

  const options = [...groups.entries()].map(([key, logs]) => ({ key, name: names.get(key) ?? 'Exercise', sets: logs.length })).sort((a, b) => b.sets - a.sets);
  if (options.length === 0) {
    return (
      <Card style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg }}>
        <Icon name="dumbbell" size={28} color={t.muted} />
        <AppText variant="heading">No lifts logged yet</AppText>
        <AppText color="muted" style={{ textAlign: 'center' }}>Log sets with a weight and reps in your workouts and your volume and progress will show here.</AppText>
      </Card>
    );
  }

  const selected = options.find((o) => o.key === picked) ?? options[0];
  const prior = q.data?.priorBests[selected.key];
  const history = exerciseHistory(groups.get(selected.key) ?? [], tz, prior?.score ?? 0);
  const recent = history.slice(-8).reverse();
  const prs = history.filter((s) => s.isPR).length;
  const e1rms = history.map((s) => s.best1RM ?? s.topLoad);
  // The headline is the best ever, which may be from before the 90 days the chart shows.
  const bestEver = Math.max(e1rms.length ? Math.max(...e1rms) : 0, prior?.score ?? 0);
  const maxVol = Math.max(1, ...weeks.map((w) => w.volume));
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];

  return (
    <View style={{ gap: spacing.md }}>
      <Card style={{ gap: 4 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
          <AppText variant="heading">Load volume</AppText>
          <AppText variant="small" color="muted">Weight × reps, working sets</AppText>
        </View>
        <AppText style={{ color: t.accent, fontSize: 28, fontWeight: '900' }}>{formatKg(thisWeek.volume)}</AppText>
        <AppText variant="small" color="muted">
          this week, {thisWeek.sets} set{thisWeek.sets === 1 ? '' : 's'}
          {lastWeek && lastWeek.volume > 0 ? ` · last week ${formatKg(lastWeek.volume)}` : ''}
        </AppText>
        <View accessible accessibilityRole="image" accessibilityLabel="Weekly load volume for the last 12 weeks" style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 96, marginTop: spacing.sm }}>
          {weeks.map((w, i) => (
            <View key={w.weekStart} style={{ flex: 1, height: '100%', justifyContent: 'flex-end' }}>
              <View style={{ width: '100%', borderTopLeftRadius: 4, borderTopRightRadius: 4, backgroundColor: i === weeks.length - 1 ? t.accent : t.accent + '66', height: `${Math.max(w.volume > 0 ? 4 : 0, (w.volume / maxVol) * 100)}%` }} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
          <AppText color="muted" style={{ fontSize: 10 }}>{shortDate(weeks[0].weekStart)}</AppText>
          <AppText color="muted" style={{ fontSize: 10 }}>This week</AppText>
        </View>
      </Card>

      <Card style={{ gap: spacing.sm }}>
        <AppText variant="heading">Progression</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel="Exercise">
          {options.map((o) => <Chip key={o.key} label={o.name} active={o.key === selected.key} onPress={() => setPicked(o.key)} />)}
        </ScrollView>

        {history.length >= 2 ? (
          <TrendChart values={e1rms} labels={history.map((s) => shortDate(s.date))} color={t.accent} formatter={(v) => `${Math.round(v)}kg`} emptyText="Needs a second session for a trend" />
        ) : null}
        <AppText variant="small" color="muted">
          {prs} personal best{prs === 1 ? '' : 's'} · best estimated 1RM {Math.round(bestEver)}kg
        </AppText>

        <View>
          <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
            <AppText color="muted" style={{ width: 62, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Date</AppText>
            <AppText color="muted" style={{ flex: 1, fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Top set</AppText>
            <AppText color="muted" style={{ width: 62, textAlign: 'right', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Volume</AppText>
            <AppText color="muted" style={{ width: 56, textAlign: 'right', fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>Est 1RM</AppText>
          </View>
          {recent.map((s) => (
            <View key={s.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
              <AppText color="muted" style={{ width: 62 }}>{shortDate(s.date)}</AppText>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                <AppText style={{ fontWeight: '700' }}>{s.topLoad}kg × {s.topReps}</AppText>
                {s.isPR ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Icon name="trophy" size={11} color={t.accent} />
                    <AppText style={{ color: t.accentText, fontSize: 10, fontWeight: '800' }}>PB</AppText>
                  </View>
                ) : null}
              </View>
              <AppText color="muted" style={{ width: 62, textAlign: 'right' }}>{formatKg(s.volume)}</AppText>
              <AppText color="muted" style={{ width: 56, textAlign: 'right' }}>{s.best1RM ? `${Math.round(s.best1RM)}kg` : '-'}</AppText>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
