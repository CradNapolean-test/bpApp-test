import { ActivityIndicator, View } from 'react-native';

import { sortRewards } from '@ballistic/shared/utils/community';

import { ClubCard, RewardCard } from '@/components/community';
import { FormsEmpty } from '@/components/forms';
import { AppText, Button, Screen, ScrollScreen } from '@/components/ui';
import { useRewardList, useRewardProgress } from '@/lib/community';
import { spacing, useTheme } from '@/theme';

// Session clubs and loyalty rewards (a water bottle at 18 months, a hoodie at 100 sessions, ...): earned ones first.
export default function Rewards() {
  const t = useTheme();
  const list = useRewardList();
  const progress = useRewardProgress();

  if (list.isPending || progress.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (list.isError || progress.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your rewards.</AppText>
        <Button title="Try again" onPress={() => { list.refetch(); progress.refetch(); }} />
      </Screen>
    );
  }
  const { sessions, months, grantedIds } = progress.data;
  const sorted = sortRewards(list.data, sessions, months, grantedIds);
  return (
    <ScrollScreen refreshing={list.isRefetching || progress.isRefetching} onRefresh={() => { list.refetch(); progress.refetch(); }}>
      <ClubCard sessions={sessions} />
      {sorted.length === 0 ? (
        <FormsEmpty icon="gift" title="No rewards yet" text="Loyalty gifts like bottles and hoodies will show up here." />
      ) : (
        <View style={{ gap: spacing.sm }}>
          {sorted.map((r) => <RewardCard key={r.id} reward={r} sessions={sessions} months={months} grantedIds={grantedIds} />)}
        </View>
      )}
    </ScrollScreen>
  );
}
