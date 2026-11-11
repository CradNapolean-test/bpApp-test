import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { FIRST_WEEK_DAYS, type FirstWeek, type FirstWeekItem } from '@ballistic/shared/utils/firstWeek';

import { Icon } from '@/components/icons';
import { Pressable } from '@/components/press';
import { AppText } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// D17: "Your first week" on Home for the 7 days after onboarding (web: FirstWeekCard.tsx). Each step ticks itself from the member's own
// rows and opens where it is done; the card goes when all are done or the week is over (the rules: @ballistic/shared/utils/firstWeek).
export function FirstWeekCard({ week, intakeId }: { week: FirstWeek; intakeId: string | null }) {
  const t = useTheme();
  const router = useRouter();
  const total = week.items.length;
  const open = (item: FirstWeekItem) => {
    if (item.key === 'photos') router.navigate('/progress');
    else if (item.key === 'weigh_in') router.navigate('/checkin');
    else if (item.key === 'intake') {
      if (intakeId && !item.done) router.navigate({ pathname: '/form/[assignmentId]', params: { assignmentId: intakeId } });
      else router.navigate('/forms');
    } else if (item.key === 'book') router.navigate('/classes');
    else router.navigate('/chat');
  };
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      <View style={{ paddingHorizontal: spacing.md, paddingTop: 14, paddingBottom: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
          <AppText style={{ fontSize: 16, fontWeight: '800' }}>Your first week</AppText>
          <AppText variant="small" color="muted" style={{ fontWeight: '600' }}>Day {week.day} of {FIRST_WEEK_DAYS}</AppText>
        </View>
        <AppText variant="small" color="muted" style={{ marginTop: 2 }}>{week.doneCount} of {total} done</AppText>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${week.doneCount} of ${total} first week steps done`}
          style={{ marginTop: 8, height: 6, borderRadius: 3, backgroundColor: t.cardMuted, overflow: 'hidden' }}
        >
          <View style={{ width: `${(week.doneCount / total) * 100}%`, height: 6, borderRadius: 3, backgroundColor: t.accent }} />
        </View>
      </View>
      {week.items.map((item) => (
        <Pressable
          key={item.key}
          onPress={() => open(item)}
          accessibilityRole="button"
          accessibilityLabel={`${item.title}. ${item.done ? 'Done' : item.detail}`}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 12, minHeight: 44, borderTopWidth: 1, borderTopColor: t.border }}
        >
          {item.done ? (
            <Icon name="circleCheck" size={20} color={t.success} />
          ) : (
            <View style={{ width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: t.border }} />
          )}
          <View style={{ flex: 1, minWidth: 0 }}>
            <AppText
              numberOfLines={1}
              style={{ fontWeight: '700', color: item.done ? t.muted : t.foreground, textDecorationLine: item.done ? 'line-through' : 'none' }}
            >
              {item.title}
            </AppText>
            {!item.done ? <AppText variant="small" color="muted" numberOfLines={1}>{item.detail}</AppText> : null}
          </View>
          {!item.done ? <Icon name="chevronRight" size={16} color={t.muted} /> : null}
        </Pressable>
      ))}
    </View>
  );
}
