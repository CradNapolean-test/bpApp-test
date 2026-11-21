import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import { ScrollView, Text, View, type LayoutChangeEvent, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import type { ClientProfileRow, DailyLogRow } from '@ballistic/shared/data/types';
import { dayCaloriesOf, hasFoodLogged } from '@ballistic/shared/utils/dailyLog';
import { BROWSE_DAYS, FOOD_AHEAD_DAYS } from '@ballistic/shared/utils/dayPatch';
import {
  checkinDayLabel,
  checkinRing,
  checkinStripCaption,
  checkinStripDays,
  dayRingTarget,
  foodDayLabel,
  foodRing,
  foodStripCaption,
  foodStripDays,
  monthOver,
  type CheckinDay,
  type FoodDay,
  type Tracker,
} from '@ballistic/shared/utils/dayStrip';
import { WEEKDAY_SHORT } from '@ballistic/shared/utils/dates';

import { Pressable } from '@/components/press';
import { useCalorieTargets } from '@/lib/foodTarget';
import { useRecentLogs } from '@/lib/today';

// The day strip on the food diary and the daily check-in (item 8, signed off 21 Nov 2026), the phone's copy of the web's
// app/dashboard/_components/DayStrip.tsx, in the same dark as the web's header in both themes. The day picked is a white circle with
// a dark extra-bold number; a day all done is a 2px teal ring with a light-teal number (Book's booked day on the web); a day part
// done gets that share of the ring in teal, clockwise from 12 o'clock, the number still grey; today's number is white and extra bold
// whenever today is not picked, also inside a full ring; a small month name sits over the 1st. Book keeps its own strip
// (components/classes.tsx).

const INK = '#1d1d1b';
const ZINC = { 100: '#f4f4f5', 300: '#d4d4d8', 400: '#a1a1aa' } as const;
const TEAL = '#19adb1';
const TEAL_LIGHT = '#5fd6d6';
const DAY_W = 44;
const GAP = 6;
const PAD = 14;
const RING_R = 17;
const RING_C = 2 * Math.PI * RING_R;
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`);
const NO_WEEKS: Record<string, string[]> = {};

export interface StripDay {
  iso: string;
  label: string;
  ring: number;
}

export function DayStrip({
  days,
  selected,
  todayIso,
  caption,
  onSelect,
}: {
  days: StripDay[];
  selected: string;
  todayIso: string;
  caption: string;
  onSelect: (iso: string) => void;
}) {
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const offset = useRef(0);
  const [width, setWidth] = useState(0);
  const index = days.findIndex((d) => d.iso === selected);

  // The day picked is kept in view with a day's room either side: today (at the right-hand end) when the strip opens, and the day
  // the Today button goes back to.
  useEffect(() => {
    if (!width || index < 0) return;
    const left = PAD + index * (DAY_W + GAP);
    const room = DAY_W + GAP;
    let x = offset.current;
    if (left + DAY_W + room > x + width) x = left + DAY_W + room - width;
    else if (left - room < x) x = left - room;
    x = Math.max(0, x);
    if (x !== offset.current) scroller.current?.scrollTo({ x, animated: offset.current !== 0 });
  }, [width, index]);

  return (
    <View style={{ backgroundColor: INK, borderRadius: 20, paddingVertical: PAD, gap: 8 }}>
      <ScrollView
        ref={scroller}
        horizontal
        showsHorizontalScrollIndicator={false}
        onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
        onScroll={(e: NativeSyntheticEvent<NativeScrollEvent>) => {
          offset.current = e.nativeEvent.contentOffset.x;
        }}
        scrollEventThrottle={32}
        contentContainerStyle={{ gap: GAP, paddingHorizontal: PAD }}>
        {days.map((d) => {
          const dt = parse(d.iso);
          const active = d.iso === selected;
          const isToday = d.iso === todayIso;
          const done = !active && d.ring >= 1;
          const part = !active && d.ring > 0 && d.ring < 1;
          const numberColor = active ? INK : isToday ? '#ffffff' : done ? TEAL_LIGHT : ZINC[400];
          const numberWeight = active || isToday ? '800' : done ? '700' : '600';
          return (
            <Pressable
              key={d.iso}
              onPress={() => onSelect(d.iso)}
              accessibilityRole="button"
              accessibilityLabel={d.label}
              accessibilityState={{ selected: active }}
              style={{ width: DAY_W, alignItems: 'center', gap: 6 }}>
              <Text style={{ height: 13, lineHeight: 13, fontSize: 10, fontWeight: '800', letterSpacing: 0.5, textTransform: 'uppercase', color: ZINC[300] }}>
                {monthOver(d.iso) ?? ''}
              </Text>
              <Text style={{ fontSize: 11, lineHeight: 16, fontWeight: active ? '700' : '600', color: active ? ZINC[100] : ZINC[400] }}>{WEEKDAY_SHORT[dt.getUTCDay()]}</Text>
              <View
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 18,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: active ? ZINC[100] : done || part ? 'transparent' : 'rgba(255,255,255,0.07)',
                  borderWidth: done ? 2 : 0,
                  borderColor: TEAL,
                }}>
                {part ? (
                  // Rotated with a style transform (as ProgressRing does) so the arc starts at 12 o'clock.
                  <Svg width={36} height={36} style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}>
                    <Circle cx={18} cy={18} r={RING_R} stroke="rgba(255,255,255,0.16)" strokeWidth={2} fill="none" />
                    <Circle cx={18} cy={18} r={RING_R} stroke={TEAL} strokeWidth={2} fill="none" strokeDasharray={`${d.ring * RING_C} ${RING_C}`} />
                  </Svg>
                ) : null}
                <Text maxFontSizeMultiplier={1.2} style={{ fontSize: 14, fontWeight: numberWeight, color: numberColor }}>{dt.getUTCDate()}</Text>
              </View>
            </Pressable>
          );
        })}
      </ScrollView>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 32, paddingHorizontal: PAD }}>
        <Text style={{ flex: 1, fontSize: 12, lineHeight: 16, color: ZINC[400] }}>{caption}</Text>
        {selected !== todayIso ? (
          <Pressable
            onPress={() => onSelect(todayIso)}
            accessibilityRole="button"
            accessibilityLabel="Back to today"
            hitSlop={6}
            style={{ height: 32, paddingHorizontal: 12, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, fontWeight: '800', color: ZINC[100] }}>Today</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

// The food diary's strip (full tracking and typed totals): 30 days back to tomorrow. The rings come from the recent days Home
// already reads (useRecentLogs, cached, refreshed after every diary change), with the day on screen always its live total and its
// live target (the high-day target on a high day).
export function FoodDayStrip({
  profile,
  today,
  date,
  live,
  liveTarget,
  onSelect,
}: {
  profile: ClientProfileRow | null;
  today: string;
  date: string;
  // The day on screen as it stands now; null while it is still being read.
  live: FoodDay | null;
  liveTarget: number | null;
  onSelect: (iso: string) => void;
}) {
  const logsQ = useRecentLogs(today, !!profile);
  const targets = useCalorieTargets(profile, today);
  const loaded = useMemo(() => {
    const days = new Map<string, FoodDay>();
    const high = new Set<string>();
    for (const row of logsQ.data ?? []) {
      days.set(row.log_date, { calories: dayCaloriesOf(row), hasFood: hasFoodLogged(row) });
      if (row.day_type === 'high') high.add(row.log_date);
    }
    return { days, high };
  }, [logsQ.data]);
  const foodDays = new Map(loaded.days);
  if (live) foodDays.set(date, live);
  const days = foodStripDays(today, BROWSE_DAYS, FOOD_AHEAD_DAYS).map((iso) => {
    // The day on screen has its live target; the recent days are refetched after a high-day change, so no week is kept here.
    const target = iso === date ? liveTarget : dayRingTarget(iso, targets, NO_WEEKS, loaded.high);
    const day = foodDays.get(iso);
    return { iso, label: foodDayLabel(iso, today, day, target), ring: foodRing(iso, today, day, target) };
  });
  return <DayStrip days={days} selected={date} todayIso={today} caption={foodStripCaption(date, today, foodDays, liveTarget != null)} onSelect={onSelect} />;
}

// The daily check-in's strip: whole weeks back to the Monday of the week 30 days ago, up to this Sunday. The rings come from the
// recent days (useRecentLogs) with the week on screen over them (its rows change the moment a figure is saved).
export function CheckinDayStrip({
  today,
  selected,
  weekLogs,
  trackers,
  onSelect,
}: {
  today: string;
  selected: string;
  weekLogs: DailyLogRow[];
  trackers: Tracker[];
  onSelect: (iso: string) => void;
}) {
  const logsQ = useRecentLogs(today, true);
  const logs = new Map<string, CheckinDay>();
  for (const row of [...(logsQ.data ?? []), ...weekLogs]) logs.set(row.log_date, row);
  const days = checkinStripDays(today, BROWSE_DAYS).map((iso) => ({
    iso,
    label: checkinDayLabel(iso, today, logs.get(iso), trackers),
    ring: checkinRing(iso, today, logs.get(iso), trackers),
  }));
  return <DayStrip days={days} selected={selected} todayIso={today} caption={checkinStripCaption(selected, today, logs, trackers)} onSelect={onSelect} />;
}
