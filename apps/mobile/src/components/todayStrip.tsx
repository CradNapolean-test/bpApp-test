import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { foodStripText, workoutStripText, type FoodLeft, type StripText, type StripWorkout } from '@ballistic/shared/utils/todayStrip';
import { dayHighlights } from '@ballistic/shared/workoutSections';

import { Icon, type IconName } from '@/components/icons';
import { Pressable } from '@/components/press';
import { AppText } from '@/components/ui';
import type { TodayWorkout } from '@/lib/today';
import { radius, useTheme } from '@/theme';

// D15: today's workout, and calories and protein left today, under the greeting on Home (web: TodayStrip.tsx). Each half opens where
// it is done: the day's workout, or the food diary. The wording is in @ballistic/shared/utils/todayStrip.

export function stripWorkoutOf(w: TodayWorkout | undefined): StripWorkout {
  if (!w || w.status === 'no_program') return { status: 'none' };
  if (w.status === 'no_start_date') return { status: 'no_start_date', programName: w.programName };
  if (w.status === 'ended') return { status: 'ended' };
  if (w.status === 'rest_day') return { status: 'rest_day', weekNum: w.weekNum };
  return {
    status: 'workout',
    dayLabel: w.day.day_label,
    highlights: dayHighlights(w.exercises),
    exerciseCount: w.exercises.filter((e) => e.block_type === 'exercise').length,
    weekNum: w.weekNum,
    done: w.loggedToday,
  };
}

function Half({ icon, text, onPress }: { icon: IconName; text: StripText; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${text.label}: ${text.title}, ${text.detail}`}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 14 }}
    >
      <Icon name={icon} size={16} color={t.accent} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText color="muted" style={{ fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.2 }} numberOfLines={1}>{text.label}</AppText>
        <AppText style={{ fontSize: 16, fontWeight: '800', color: text.over ? t.warning : t.foreground }} numberOfLines={1}>{text.title}</AppText>
        <AppText variant="small" color="muted" numberOfLines={1}>{text.detail}</AppText>
      </View>
    </Pressable>
  );
}

export function TodayStrip({ workout, food, dayId }: { workout: StripWorkout | null; food: FoodLeft | null; dayId: string | null }) {
  const t = useTheme();
  const router = useRouter();
  const workoutText = workout ? workoutStripText(workout) : null;
  const foodText = food ? foodStripText(food) : null;
  if (!workoutText && !foodText) return null;
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      {workoutText ? (
        <Half
          icon="dumbbell"
          text={workoutText}
          onPress={() => (dayId ? router.navigate({ pathname: '/workout/[dayId]', params: { dayId } }) : router.navigate('/workouts'))}
        />
      ) : null}
      {workoutText && foodText ? <View style={{ width: 1, backgroundColor: t.border }} /> : null}
      {foodText ? <Half icon="apple" text={foodText} onPress={() => router.navigate('/food')} /> : null}
    </View>
  );
}
