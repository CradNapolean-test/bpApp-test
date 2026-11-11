import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { whatsNextDraft, type ChallengeHome } from '@ballistic/shared/utils/challengeHome';
import { formatLongDate, formatShortDate } from '@ballistic/shared/utils/dates';

import { IconChip } from '@/components/home';
import { Icon, type IconName } from '@/components/icons';
import { Pressable } from '@/components/press';
import { AppText } from '@/components/ui';
import { useOngoingPlans } from '@/lib/home';
import { spacing, useTheme } from '@/theme';

// D5: in the last 2 weeks of a plan with a set length (the 6 Week Challenge), carry on with one of the gym's ongoing plans (Big Dog) or
// a call with the coach. Both open the chat with the coach, a message ready to send (web: HomeChallenge.tsx).

export const shortDay = (iso: string) => formatShortDate(iso);

function ChoiceRow({ icon, title, subtitle, onPress }: { icon: IconName; title: string; subtitle: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${subtitle}`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.border, backgroundColor: t.card, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12, minHeight: 44 }}
    >
      <IconChip icon={icon} tone="accent" size={32} />
      <View style={{ flex: 1 }}>
        <AppText style={{ fontWeight: '800' }} numberOfLines={1}>{title}</AppText>
        <AppText variant="small" color="muted" numberOfLines={1}>{subtitle}</AppText>
      </View>
      <Icon name="chevronRight" size={16} color={t.accent} />
    </Pressable>
  );
}

export function WhatsNextCard({ home, gymId, coachName }: { home: ChallengeHome; gymId: string | null | undefined; coachName: string | null | undefined }) {
  const t = useTheme();
  const router = useRouter();
  const plansQ = useOngoingPlans(gymId, true);
  const plans = plansQ.data ?? [];
  const { endsOn, state } = home.countdown;
  const title =
    state === 'ended' ? `Your ${home.planName} has finished` : endsOn ? `Your ${home.planName} ends ${formatLongDate(endsOn)}` : `Your ${home.planName} is nearly over`;
  const coach = coachName ?? 'your coach';
  const choose = (choice: { plan: string } | 'call') =>
    router.navigate({ pathname: '/chat', params: { draft: whatsNextDraft(home, choice, shortDay) } });

  return (
    <View style={{ borderWidth: 1, borderColor: t.accent + '4D', backgroundColor: t.accentSoft, borderRadius: 24, padding: spacing.md, gap: spacing.sm }}>
      <View>
        <AppText variant="small" color="accent" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.4 }}>What&apos;s next</AppText>
        <AppText style={{ fontSize: 18, fontWeight: '900', marginTop: 2 }}>{title}</AppText>
        <AppText variant="small" color="muted" style={{ marginTop: 4 }}>
          Keep the momentum going. Pick one and a message to {coach} is ready for you to send.
        </AppText>
      </View>
      {plans.map((p) => (
        <ChoiceRow
          key={p.id}
          icon="dumbbell"
          title={`Carry on with ${p.name}`}
          subtitle={`${p.credits_per_week} credit${p.credits_per_week === 1 ? '' : 's'} a week`}
          onPress={() => choose({ plan: p.name })}
        />
      ))}
      <ChoiceRow icon="messageCircle" title={`Book a call with ${coach}`} subtitle="Talk through what comes next" onPress={() => choose('call')} />
    </View>
  );
}
