import { ActivityIndicator, RefreshControl, ScrollView, View } from 'react-native';

import {
  OVERVIEW_WEEKS,
  buildWeeklyTrend,
  latestBodyweight,
  trendSummary,
  weightGoal,
  type TrendKey,
} from '@ballistic/shared/utils/overview';

import { TrendChart } from '@/components/charts';
import { AppText, Button, Card } from '@/components/ui';
import { useClientProfile, useRecentLogs } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

function GoalCard({ start, goal, now, pct, toGo }: { start: number; goal: number; now: number | null; pct: number; toGo: number }) {
  const t = useTheme();
  const col = (label: string, value: string, align: 'flex-start' | 'center' | 'flex-end') => (
    <View style={{ alignItems: align, gap: 2 }}>
      <AppText variant="small" color="muted" style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</AppText>
      <AppText style={{ fontWeight: '800' }}>{value}</AppText>
    </View>
  );
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <AppText variant="heading">Your goal</AppText>
        <AppText color="accent" style={{ fontWeight: '800' }}>{pct}% there</AppText>
      </View>
      <View style={{ height: 10, borderRadius: 5, backgroundColor: t.cardMuted, overflow: 'hidden' }}>
        <View style={{ width: `${pct}%`, height: 10, borderRadius: 5, backgroundColor: t.accent }} />
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        {col('Start', `${start}kg`, 'flex-start')}
        {col('Now', now != null ? `${now.toFixed(1)}kg` : '—', 'center')}
        {col('Goal', `${goal}kg`, 'flex-end')}
      </View>
      <AppText variant="small" color="muted">{toGo > 0 ? `${toGo.toFixed(1)}kg to go.` : 'Goal weight reached. Nice work.'}</AppText>
    </Card>
  );
}

function TrendCard({
  title,
  weeks,
  dataKey,
  color,
  unit,
  formatter,
  lowerIsBetter,
}: {
  title: string;
  weeks: ReturnType<typeof buildWeeklyTrend>;
  dataKey: TrendKey;
  color: string;
  unit: string;
  formatter: (v: number) => string;
  lowerIsBetter?: boolean;
}) {
  const s = trendSummary(weeks, dataKey, lowerIsBetter);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">{title}</AppText>
        {s.delta != null ? (
          <AppText color={s.favourable == null ? 'muted' : s.favourable ? 'success' : 'danger'} style={{ fontWeight: '800' }}>
            {s.delta > 0 ? '+' : '-'}
            {formatter(Math.abs(s.delta))}
            {unit}
          </AppText>
        ) : null}
      </View>
      <AppText variant="title">{s.current != null ? `${formatter(s.current)}${unit}` : '—'}</AppText>
      <TrendChart values={s.points} labels={s.labels} color={color} formatter={formatter} emptyText="Needs a second week of data for a trend" />
      <AppText variant="small" color="muted">
        Weekly average{s.points.length >= 2 ? ` · last ${s.points.length} weeks` : ''}
        {s.delta != null ? ' · change vs the week before' : ''}
      </AppText>
    </Card>
  );
}

// The weekly trend lines (bodyweight, calories, steps) and the goal card. Built from the recent daily logs, which the Today
// screen has already fetched, so opening this right after Today costs no request.
export function OverviewSection({ todayIso }: { todayIso: string }) {
  const t = useTheme();
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;
  const logsQ = useRecentLogs(todayIso, !!profile);

  if (profileQ.isPending || (!!profile && logsQ.isPending)) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (logsQ.isError || profileQ.isError) {
    return (
      <View style={{ gap: spacing.md }}>
        <AppText color="danger">Could not load your trends.</AppText>
        <Button title="Try again" onPress={() => { profileQ.refetch(); logsQ.refetch(); }} />
      </View>
    );
  }

  const logs = logsQ.data ?? [];
  const weeks = buildWeeklyTrend(logs).slice(-OVERVIEW_WEEKS);
  const goal = weightGoal(profile, latestBodyweight(logs));

  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
      refreshControl={<RefreshControl refreshing={logsQ.isRefetching} onRefresh={async () => { await logsQ.refetch(); }} tintColor={t.accent} />}>
      {weeks.length === 0 ? (
        <Card style={{ gap: 4 }}>
          <AppText variant="heading">No trends yet</AppText>
          <AppText color="muted">Log a few days in your daily check-in and your weekly trends (weight, calories, protein, steps, sleep and water) will build up here.</AppText>
        </Card>
      ) : (
        <>
          {goal ? <GoalCard {...goal} /> : null}
          <TrendCard title="Bodyweight" weeks={weeks} dataKey="avgBodyweight" color={t.accent} unit="kg" formatter={(v) => v.toFixed(1)} lowerIsBetter />
          <TrendCard title="Calories" weeks={weeks} dataKey="avgCalories" color="#e8a020" unit="kcal" formatter={(v) => Math.round(v).toString()} />
          <TrendCard title="Protein" weeks={weeks} dataKey="avgProtein" color="#a07aff" unit="g" formatter={(v) => Math.round(v).toString()} lowerIsBetter={false} />
          <TrendCard title="Steps" weeks={weeks} dataKey="avgSteps" color="#2ecc71" unit="" formatter={(v) => Math.round(v).toString()} lowerIsBetter={false} />
          <TrendCard title="Sleep" weeks={weeks} dataKey="avgSleep" color="#3b82f6" unit="h" formatter={(v) => v.toFixed(1)} lowerIsBetter={false} />
          <TrendCard title="Water" weeks={weeks} dataKey="avgWater" color="#38bdf8" unit="L" formatter={(v) => v.toFixed(1)} lowerIsBetter={false} />
        </>
      )}
    </ScrollView>
  );
}
