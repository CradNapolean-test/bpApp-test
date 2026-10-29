import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Circle, G, Line, Polyline, Text as SvgText } from 'react-native-svg';

import { weeklyTarget } from '@ballistic/shared/calculations';
import type { DailyLogRow } from '@ballistic/shared/data/types';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import {
  METRICS,
  RANGES,
  chartDomain,
  dailyPoints,
  formatMetricValue,
  movingAverage,
  needsMoreHistory,
  rangeStart,
  summarize,
  weeklyAverages,
  type DayPoint,
  type MetricInfo,
  type MetricKey,
  type RangeKey,
} from '@ballistic/shared/utils/metrics';
import { programWeekFromLogs } from '@ballistic/shared/utils/streak';

import { AppText, Button, Card, Chip, Segmented } from '@/components/ui';
import { useClientProfile, useRecentLogs } from '@/lib/today';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { spacing, useTheme } from '@/theme';

const HEIGHT = 200;
const PAD = { left: 40, right: 10, top: 10, bottom: 22 };
const DAY_MS = 86_400_000;
const dayNo = (iso: string) => Date.parse(iso + 'T00:00:00Z') / DAY_MS;
const shortDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const longDate = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

// One metric as dots (every logged day) with a 7-day average through them, or as weekly averages, with a dashed target line.
// Touch and drag along the chart to read any day. Same drawing and rules as the web's Metrics tab.
function MetricChart({ info, points, line, target, weekly }: { info: MetricInfo; points: DayPoint[]; line: DayPoint[]; target: number | null; weekly: boolean }) {
  const t = useTheme();
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const onLayout = (e: LayoutChangeEvent) => setWidth(Math.max(0, e.nativeEvent.layout.width));

  const first = dayNo(points[0].date);
  const last = dayNo(points[points.length - 1].date);
  const span = Math.max(1, last - first);
  const domain = chartDomain([...points.map((p) => p.value), ...line.map((p) => p.value)], target);
  const x = (date: string) => PAD.left + ((dayNo(date) - first) / span) * Math.max(1, width - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - domain.min) / (domain.max - domain.min)) * (HEIGHT - PAD.top - PAD.bottom);
  const fmt = (v: number) => formatMetricValue(v, { digits: info.digits, unit: '' });
  const ticks = [domain.max, (domain.max + domain.min) / 2, domain.min];

  function pick(locationX: number) {
    const wanted = first + ((locationX - PAD.left) / Math.max(1, width - PAD.left - PAD.right)) * span;
    let best = points[0];
    for (const p of points) if (Math.abs(dayNo(p.date) - wanted) < Math.abs(dayNo(best.date) - wanted)) best = p;
    setSelected(best.date);
  }

  const shown = points.find((p) => p.date === selected) ?? points[points.length - 1];
  const smooth = line.find((p) => p.date === shown.date);

  return (
    <View style={{ gap: 4 }}>
      <AppText variant="small" color="muted" style={{ minHeight: 36 }}>
        <AppText variant="small" style={{ fontWeight: '700' }}>{weekly ? `Week of ${shortDate(shown.date)}` : longDate(shown.date)}</AppText>
        {' · '}
        <AppText variant="small" style={{ fontWeight: '800' }}>{formatMetricValue(shown.value, info)}</AppText>
        {!weekly && smooth && points.length > 1 ? ` · 7-day average ${formatMetricValue(smooth.value, info)}` : ''}
      </AppText>
      <View
        style={{ height: HEIGHT }}
        onLayout={onLayout}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={(e) => pick(e.nativeEvent.locationX)}
        onResponderMove={(e) => pick(e.nativeEvent.locationX)}
        accessible
        accessibilityLabel={`${info.label} chart, ${points.length} ${weekly ? 'weeks' : 'days'}. Drag to read a value.`}>
        {width > 0 ? (
          <Svg width={width} height={HEIGHT}>
            {ticks.map((tick, i) => (
              <G key={i}>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(tick)} y2={y(tick)} stroke={t.border} strokeWidth={1} />
                <SvgText x={PAD.left - 5} y={y(tick) + 3} fontSize={9} fill={t.muted} textAnchor="end">{fmt(tick)}</SvgText>
              </G>
            ))}
            {target != null ? (
              <>
                <Line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke={t.muted} strokeWidth={1} strokeDasharray="4 3" />
                <SvgText x={width - PAD.right} y={y(target) - 3} fontSize={9} fill={t.muted} textAnchor="end">{info.key === 'bodyweight' ? 'Goal' : 'Target'} {fmt(target)}</SvgText>
              </>
            ) : null}
            {line.length > 1 ? (
              <Polyline points={line.map((p) => `${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')} fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            ) : null}
            {points.map((p) => (
              <Circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={weekly ? 3 : 2.2} fill={t.accent} fillOpacity={weekly ? 1 : 0.4} />
            ))}
            <Line x1={x(shown.date)} x2={x(shown.date)} y1={PAD.top} y2={HEIGHT - PAD.bottom} stroke={t.muted} strokeOpacity={0.4} strokeWidth={1} />
            <Circle cx={x(shown.date)} cy={y(shown.value)} r={4.5} fill={t.accent} stroke={t.card} strokeWidth={1.5} />
            <SvgText x={PAD.left} y={HEIGHT - 6} fontSize={9} fill={t.muted}>{shortDate(points[0].date)}</SvgText>
            <SvgText x={width - PAD.right} y={HEIGHT - 6} fontSize={9} fill={t.muted} textAnchor="end">{shortDate(points[points.length - 1].date)}</SvgText>
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'success' | 'danger' }) {
  const t = useTheme();
  return (
    <View style={{ flexBasis: '47%', flexGrow: 1, backgroundColor: t.cardMuted, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8 }}>
      <AppText variant="small" color="muted" style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase' }}>{label}</AppText>
      <AppText color={tone} style={{ fontWeight: '800', fontSize: 16 }}>{value}</AppText>
    </View>
  );
}

// Progress > Charts: any of the daily numbers over 4 weeks to everything logged, daily or by week, against the target.
export function MetricsSection({ todayIso }: { todayIso: string }) {
  const t = useTheme();
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;
  const recentQ = useRecentLogs(todayIso, !!profile);
  const [metric, setMetric] = useState<MetricKey>('bodyweight');
  const [range, setRange] = useState<RangeKey>('12w');
  const [mode, setMode] = useState<'daily' | 'weekly'>('daily');

  // The recent days cover 12 weeks; a longer range reads everything once, the first time it is asked for.
  const wantsMore = needsMoreHistory(range);
  const fullQ = useQuery({
    queryKey: ['daily-logs', userId, 'all'],
    enabled: wantsMore && !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<DailyLogRow[]> => {
      const { data, error } = await supabase.from('daily_logs').select('*').eq('client_id', userId).lte('log_date', todayIso).order('log_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyLogRow[];
    },
  });
  const recent = useMemo(() => recentQ.data ?? [], [recentQ.data]);
  const logs = wantsMore && fullQ.data ? fullQ.data : recent;

  const info = METRICS.find((m) => m.key === metric)!;
  const from = rangeStart(todayIso, range);
  const daily = useMemo(() => dailyPoints(logs, metric, from, todayIso), [logs, metric, from, todayIso]);
  const weekly = useMemo(() => weeklyAverages(daily), [daily]);
  const points = mode === 'daily' ? daily : weekly;
  const line = useMemo(() => (mode === 'daily' ? movingAverage(daily) : weekly), [mode, daily, weekly]);
  const summary = summarize(points, info.better);

  const target = useMemo(() => {
    if (metric === 'bodyweight') return profile?.goal_weight ?? null;
    const engine = toMemberEngineProfile(profile, false);
    const day = engine ? weeklyTarget(engine, programWeekFromLogs(recent, todayIso))?.dailyFlat : null;
    if (!day) return null;
    return metric === 'calories' ? day.calories : metric === 'protein' ? day.protein : null;
  }, [metric, profile, recent, todayIso]);

  if (profileQ.isPending || (!!profile && recentQ.isPending)) return <ActivityIndicator color={t.accent} style={{ marginTop: spacing.lg }} />;
  if (profileQ.isError || recentQ.isError) {
    return (
      <View style={{ gap: spacing.md }}>
        <AppText color="danger">Could not load your charts.</AppText>
        <Button title="Try again" onPress={() => { profileQ.refetch(); recentQ.refetch(); }} />
      </View>
    );
  }

  const change = summary.change;
  return (
    <ScrollView
      contentContainerStyle={{ gap: spacing.md, paddingBottom: spacing.xl }}
      keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={recentQ.isRefetching} onRefresh={async () => { await recentQ.refetch(); }} tintColor={t.accent} />}>
      <Card style={{ gap: spacing.sm }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
          {METRICS.map((m) => <Chip key={m.key} label={m.label} active={metric === m.key} onPress={() => setMetric(m.key)} />)}
        </ScrollView>
        <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ value: r.key, label: r.key === '4w' ? '4 wk' : r.key === '12w' ? '12 wk' : r.key === '6m' ? '6 mo' : 'All' }))} />
        <Segmented value={mode} onChange={setMode} options={[{ value: 'daily', label: 'Daily' }, { value: 'weekly', label: 'Weekly' }]} />
      </Card>

      {wantsMore && fullQ.isPending ? (
        <AppText color="muted">Loading your history…</AppText>
      ) : wantsMore && fullQ.isError ? (
        <AppText color="danger">Could not load your full history.</AppText>
      ) : points.length < 2 ? (
        <Card style={{ gap: 4 }}>
          <AppText variant="heading">Not enough data for this chart yet</AppText>
          <AppText color="muted">Log {info.label.toLowerCase()} on a couple of days (or pick a longer time range) and it will show up here.</AppText>
        </Card>
      ) : (
        <>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            <Tile label="Latest" value={summary.latest != null ? formatMetricValue(summary.latest, info) : '—'} />
            <Tile
              label="Change"
              value={change == null ? '—' : `${change > 0 ? '+' : change < 0 ? '−' : ''}${formatMetricValue(Math.abs(change), info)}`}
              tone={summary.favourable == null ? undefined : summary.favourable ? 'success' : 'danger'}
            />
            <Tile label="Average" value={summary.average != null ? formatMetricValue(summary.average, info) : '—'} />
            <Tile label="Lowest – highest" value={summary.min != null && summary.max != null ? `${formatMetricValue(summary.min, { ...info, unit: '' })} – ${formatMetricValue(summary.max, info)}` : '—'} />
          </View>
          <Card style={{ gap: spacing.sm }}>
            <MetricChart key={`${metric}:${mode}:${range}`} info={info} points={points} line={line} target={target} weekly={mode === 'weekly'} />
            <AppText variant="small" color="muted">
              {mode === 'daily' ? 'Each dot is a day you logged; the line is the 7-day average. Drag along the chart to read any day.' : 'Each dot is the average of the days you logged that week. Drag along the chart to read any week.'}
            </AppText>
          </Card>
        </>
      )}
    </ScrollView>
  );
}
