import { useState } from 'react';

import { clubProgress } from '@ballistic/shared/utils/clubs';
import { monthsSince, nextSessionsReward } from '@ballistic/shared/utils/home';
import { showsStreak } from '@ballistic/shared/utils/streak';

import { DetailsConfirmBanner, EventBanner, ExploreTiles, FormsBanner, MyCoachingTile, StatsCard, YourProgress } from '@/components/home';
import { PushCard } from '@/components/push';
import { HomeSkeleton } from '@/components/skeleton';
import { Hero, NextSessionCard } from '@/components/today';
import { AppText, Button, Screen, ScrollScreen } from '@/components/ui';
import { useGymReferralUrl, useNextEvent, useRewardList } from '@/lib/community';
import { useDayContext } from '@/lib/day';
import { useSessionsDone } from '@/lib/home';
import { useScreenAccess } from '@/lib/screens';
import { useSession } from '@/lib/session';
import { useCredits, usePendingForms, useTodayWorkout, useUpcomingBookings } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { spacing } from '@/theme';

export default function Today() {
  const { signOut } = useSession();
  const me = useMe();

  if (me.isPending) return <HomeSkeleton />;
  if (me.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your account: {me.error.message}</AppText>
        <Button title="Try again" onPress={() => me.refetch()} />
      </Screen>
    );
  }
  // The member app is for members only; coaches and owners use the web dashboard.
  if (me.data.role !== 'client') {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText variant="heading">This app is for members</AppText>
        <AppText color="muted">Coaches and owners use the Ballistic web dashboard.</AppText>
        <Button title="Sign out" variant="secondary" onPress={signOut} />
      </Screen>
    );
  }
  return <HomeContent />;
}

function HomeContent() {
  const { areas } = useScreenAccess();
  const { now, profileQ, profile, tz, todayIso, ready, logsQ, streak, checkinDone, checkinTotal } = useDayContext();

  // One small query per card, started together once the profile (which holds the timezone) is known.
  const bookingsQ = useUpcomingBookings(todayIso, ready);
  const creditsQ = useCredits();
  const formsQ = usePendingForms();
  const workoutQ = useTodayWorkout(todayIso, tz, ready);
  const doneQ = useSessionsDone();
  const rewardsQ = useRewardList();
  const eventQ = useNextEvent();
  const referral = useGymReferralUrl();

  const nextBooking = [...(bookingsQ.data ?? [])].sort((a, b) =>
    (a.booking_date + (a.class?.start_time ?? '')).localeCompare(b.booking_date + (b.class?.start_time ?? '')),
  )[0];
  const membership = creditsQ.data?.membership ?? null;
  const memberMonths = membership ? monthsSince(membership.started_at, now) : null;
  const sessionsDone = doneQ.data ?? 0;
  const club = clubProgress(sessionsDone);
  const nextReward = nextSessionsReward(rewardsQ.data ?? [], doneQ.data ?? 0);

  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await Promise.all([profileQ.refetch(), logsQ.refetch(), bookingsQ.refetch(), creditsQ.refetch(), formsQ.refetch(), workoutQ.refetch(), doneQ.refetch()]);
    setRefreshing(false);
  }

  if (profileQ.isPending) return <HomeSkeleton />;
  if (profileQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your profile: {profileQ.error.message}</AppText>
        <Button title="Try again" onPress={() => profileQ.refetch()} />
      </Screen>
    );
  }
  // Onboarding is handled before the tabs open (app/(app)/_layout.tsx); this only shows if that check could not run.
  if (!profile) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText variant="heading">Finish setting up your profile</AppText>
        <AppText color="muted">We could not find your profile yet. Check your connection and try again.</AppText>
        <Button title="Try again" onPress={() => profileQ.refetch()} />
      </Screen>
    );
  }

  return (
    <ScrollScreen refreshing={refreshing} onRefresh={refresh}>
      <Hero profile={profile} now={now} />
      <DetailsConfirmBanner clientId={profile.client_id} requestedAt={profile.details_confirm_requested_at} />
      {eventQ.data ? <EventBanner key={eventQ.data.id} event={eventQ.data} /> : null}
      <NextSessionCard booking={nextBooking} todayIso={todayIso} tz={tz} now={now} workout={workoutQ.data} />
      <MyCoachingTile />
      <StatsCard streak={streak} showStreak={showsStreak(membership)} checkinDone={checkinDone} checkinTotal={checkinTotal} enabled={areas.weeklyLog} />
      {areas.forms ? <FormsBanner count={formsQ.data ?? 0} /> : null}
      <PushCard />
      <YourProgress sessionsDone={sessionsDone} club={club} memberMonths={memberMonths} nextReward={nextReward} />
      <ExploreTiles education={areas.education} referral={!!referral.url} />
    </ScrollScreen>
  );
}
