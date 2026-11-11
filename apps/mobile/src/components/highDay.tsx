import { View } from 'react-native';

import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { canEditFoodDay } from '@ballistic/shared/utils/dayPatch';
import { HIGH_DAYS_PER_WEEK } from '@ballistic/shared/utils/dayTarget';
import { targetsHeldBack } from '@ballistic/shared/onboarding';

import { AppText, SmallButton } from '@/components/ui';
import { useHighDay } from '@/lib/foodTarget';
import { spacing } from '@/theme';

// Calorie cycling, under the diary's targets (the web has the same in HighDayControl): whether this is a normal (lower calorie)
// day or one of the member's high days, and a button to change it. Up to HIGH_DAYS_PER_WEEK high days a week. Shows nothing
// for a member who is not on calorie cycling.
export function HighDayRow({ profile, today, date }: { profile: ClientProfileRow | null; today: string; date: string }) {
  const high = useHighDay(profile, today, date);
  if (!high.cycling || targetsHeldBack(profile, false)) return null;

  const extra = Math.round(high.extraCalories).toLocaleString();
  // `left` does not count this day, so on a high day one of them is this day.
  const moreLeft = Math.max(0, high.left - 1);
  const detail = high.failed
    ? "Couldn't load this week's high days."
    : !high.loaded
    ? 'Calorie cycling'
    : high.isHigh
      ? moreLeft > 0 ? `You can have ${moreLeft} more high day${moreLeft === 1 ? '' : 's'} this week.` : 'That is all your high days for this week.'
      : high.left > 0 ? `${high.left} of ${HIGH_DAYS_PER_WEEK} high days left this week, +${extra} kcal each.` : `You have used your ${HIGH_DAYS_PER_WEEK} high days this week.`;
  const canChange = !high.failed && canEditFoodDay(date, today) && (high.isHigh || high.left > 0);
  const error = high.toggle.error instanceof Error ? high.toggle.error.message : null;

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <AppText variant="small" style={{ fontWeight: '700' }}>{high.failed ? 'Calorie cycling' : high.isHigh ? 'High day' : 'Normal day'}</AppText>
          <AppText variant="small" color={high.failed ? 'danger' : 'muted'}>{detail}</AppText>
        </View>
        {high.failed ? <SmallButton title="Try again" tone="muted" onPress={high.retry} /> : null}
        {canChange ? (
          <SmallButton
            title={high.isHigh ? 'Make it a normal day' : 'Make this a high day'}
            tone="muted"
            disabled={!high.loaded || high.toggle.isPending}
            onPress={() => high.toggle.mutate(!high.isHigh)}
          />
        ) : null}
      </View>
      {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
    </View>
  );
}
