import { useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { exerciseHistory, formatKg, weeklyVolume } from '@ballistic/shared/utils/trainingStats';
import { bestSession, blockInfoFor, blockSeries, exerciseOptions, measureSessions, scoreText, topSetText } from '@ballistic/shared/workoutProgress';
import { trackingOf, TRACKING } from '@ballistic/shared/workoutTracking';

import { TrendChart } from '@/components/charts';
import { Icon } from '@/components/icons';
import { AppText, Card, Chip } from '@/components/ui';
import { useStrengthData } from '@/lib/strength';
import { spacing, useTheme } from '@/theme';

const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function PBBadge() {
  const t = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2, backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Icon name="trophy" size={11} color={t.accent} />
      <AppText style={{ color: t.accentText, fontSize: 10, fontWeight: '800' }}>PB</AppText>
    </View>
  );
}

// Strength under Progress & results: load volume per week (working load x reps), per-exercise progression with personal bests for every way
// of tracking an exercise, and how each scored block has gone each time it was done.
export function StrengthSection({ todayIso, tz }: { todayIso: string; tz: string }) {
  const t = useTheme();
  const q = useStrengthData(todayIso);
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedBlock, setPickedBlock] = useState<string | null>(null);

  const { options, weeks, series } = useMemo(() => {
    const logs = q.data?.logs ?? [];
    // The same lift in different blocks is one history (library entry, else name); each way of tracking it is its own history.
    const options = exerciseOptions(logs, (l) => {
      const lib = l.exercise_library_id ?? l.exercise?.exercise_library_id ?? null;
      const name = l.exercise?.name;
      const key = lib ?? (name ? `n:${name.toLowerCase()}` : null);
      return key ? { key, name: name ?? 'Exercise', type: trackingOf(l.exercise?.tracking_type) } : null;
    });
    const results = q.data?.results ?? [];
    const series = blockSeries(results, (dayId, blockKey) => {
      const day = results.find((r) => r.program_day_id === dayId)?.day;
      return day ? blockInfoFor(day.workout_exercises, blockKey) : null;
    }, tz);
    return { options, weeks: weeklyVolume(logs, todayIso, tz, 12), series };
  }, [q.data, todayIso, tz]);

  if (q.isPending) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (q.isError) return <AppText color="danger">Could not load your strength: {q.error.message}</AppText>;

  if (options.length === 0 && series.length === 0) {
    return (
      <Card style={{ alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.lg }}>
        <Icon name="dumbbell" size={28} color={t.muted} />
        <AppText variant="heading">No lifts logged yet</AppText>
        <AppText color="muted" style={{ textAlign: 'center' }}>Log sets in your workouts and your volume and progress will show here.</AppText>
      </Card>
    );
  }

  const selected = options.find((o) => o.key === picked) ?? options[0];
  const block = series.find((s) => s.key === pickedBlock) ?? series[0];
  const prior = selected ? q.data?.priorBests[selected.libKey] : undefined;
  const lift = selected?.type === 'weight_reps' ? exerciseHistory(selected.logs, tz, prior?.score ?? 0) : [];
  const other = selected && selected.type !== 'weight_reps' ? measureSessions(selected.type, selected.logs, tz) : [];
  const otherBest = bestSession(other);
  const otherPBs = other.filter((s) => s.isPB).length;
  const recent = lift.slice(-8).reverse();
  const prs = lift.filter((s) => s.isPR).length;
  const e1rms = lift.map((s) => s.best1RM ?? s.topLoad);
  // The headline is the best ever, which may be from before the 90 days the chart shows.
  const bestEver = Math.max(e1rms.length ? Math.max(...e1rms) : 0, prior?.score ?? 0);
  const maxVol = Math.max(1, ...weeks.map((w) => w.volume));
  const thisWeek = weeks[weeks.length - 1];
  const lastWeek = weeks[weeks.length - 2];
  const head = { fontSize: 11, fontWeight: '700' as const, textTransform: 'uppercase' as const };

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

      {selected ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Progression</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel="Exercise">
            {options.map((o) => <Chip key={o.key} label={o.name} active={o.key === selected.key} onPress={() => setPicked(o.key)} />)}
          </ScrollView>

          {selected.type === 'weight_reps' ? (
            <>
              {lift.length >= 2 ? (
                <TrendChart values={e1rms} labels={lift.map((s) => shortDate(s.date))} color={t.accent} formatter={(v) => `${Math.round(v)}kg`} emptyText="Needs a second session for a trend" />
              ) : null}
              <AppText variant="small" color="muted">
                {prs} personal best{prs === 1 ? '' : 's'} · best estimated 1RM {Math.round(bestEver)}kg
              </AppText>

              <View>
                <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
                  <AppText color="muted" style={{ width: 62, ...head }}>Date</AppText>
                  <AppText color="muted" style={{ flex: 1, ...head }}>Top set</AppText>
                  <AppText color="muted" style={{ width: 62, textAlign: 'right', ...head }}>Volume</AppText>
                  <AppText color="muted" style={{ width: 56, textAlign: 'right', ...head }}>Est 1RM</AppText>
                </View>
                {recent.map((s) => (
                  <View key={s.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                    <AppText color="muted" style={{ width: 62 }}>{shortDate(s.date)}</AppText>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <AppText style={{ fontWeight: '700' }}>{s.topLoad}kg × {s.topReps}</AppText>
                      {s.isPR ? <PBBadge /> : null}
                    </View>
                    <AppText color="muted" style={{ width: 62, textAlign: 'right' }}>{formatKg(s.volume)}</AppText>
                    <AppText color="muted" style={{ width: 56, textAlign: 'right' }}>{s.best1RM ? `${Math.round(s.best1RM)}kg` : '-'}</AppText>
                  </View>
                ))}
              </View>
            </>
          ) : (
            <>
              <AppText variant="small" color="muted">{TRACKING[selected.type].label}, last 90 days</AppText>
              {selected.type !== 'tick' && other.length >= 2 && other.every((s) => s.score) ? (
                <TrendChart values={other.map((s) => s.score![0])} labels={other.map((s) => shortDate(s.date))} color={t.accent} formatter={(v) => scoreText(selected.type, v)} emptyText="Needs a second session for a trend" />
              ) : null}
              <AppText variant="small" color="muted">
                {selected.type === 'tick'
                  ? `Done on ${other.length} day${other.length === 1 ? '' : 's'}`
                  : `${otherPBs} personal best${otherPBs === 1 ? '' : 's'}${otherBest ? ` · best ${topSetText(selected.type, otherBest.top)}` : ''}`}
              </AppText>

              <View>
                <View style={{ flexDirection: 'row', paddingBottom: 4 }}>
                  <AppText color="muted" style={{ width: 62, ...head }}>Date</AppText>
                  <AppText color="muted" style={{ flex: 1, ...head }}>{selected.type === 'tick' ? 'Result' : 'Top set'}</AppText>
                  <AppText color="muted" style={{ width: 44, textAlign: 'right', ...head }}>Sets</AppText>
                </View>
                {other.slice(-8).reverse().map((s) => (
                  <View key={s.date} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                    <AppText color="muted" style={{ width: 62 }}>{shortDate(s.date)}</AppText>
                    <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <AppText style={{ fontWeight: '700' }}>{topSetText(selected.type, s.top)}</AppText>
                      {s.isPB ? <PBBadge /> : null}
                    </View>
                    <AppText color="muted" style={{ width: 44, textAlign: 'right' }}>{s.sets}</AppText>
                  </View>
                ))}
              </View>
            </>
          )}
        </Card>
      ) : null}

      {block ? (
        <Card style={{ gap: spacing.sm }}>
          <AppText variant="heading">Block results</AppText>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }} accessibilityLabel="Block">
            {series.map((s) => <Chip key={s.key} label={s.detail ? `${s.title} · ${s.detail}` : s.title} active={s.key === block.key} onPress={() => setPickedBlock(s.key)} />)}
          </ScrollView>
          <AppText variant="small" color="muted">
            {block.entries.length} time{block.entries.length === 1 ? '' : 's'}
            {block.best ? ` · best ${block.best.text}` : ''}
          </AppText>
          <View>
            {block.entries.slice(-8).reverse().map((e) => (
              <View key={e.result.logged_at} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: 1, borderTopColor: t.border }}>
                <AppText color="muted" style={{ width: 62 }}>{shortDate(e.date)}</AppText>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <AppText style={{ fontWeight: '700' }}>{e.text}</AppText>
                  {e.isPB ? <PBBadge /> : null}
                </View>
              </View>
            ))}
          </View>
        </Card>
      ) : null}
    </View>
  );
}
