import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { bigDogCount, TIER_TITLE, tierForCount } from '@ballistic/shared/bigDog';

import { CheckinTiles, CoachCard, CountBadge, NutritionBlock } from '@/components/coach';
import { Badge, ListGroup, ListRow, ScrollScreen, SectionLabel } from '@/components/ui';
import { useBigDogResults } from '@/lib/bigDog';
import { useChatUnread, useOwnUserId } from '@/lib/chat';
import { useDayContext } from '@/lib/day';
import { useScreenAccess } from '@/lib/screens';
import { usePendingForms, useTodayWorkout, type TodayWorkout } from '@/lib/today';
import { useMe } from '@/lib/useMe';

// The Training row: today's workout (or why there is none). Opens the workout day, or the programme's weeks.
function TrainingRow({ workout }: { workout: TodayWorkout | undefined }) {
  const router = useRouter();
  const openWeeks = () => router.navigate('/workouts');
  if (!workout) return <ListRow icon="dumbbell" title="Today's workout" subtitle="Loading…" />;
  if (workout.status === 'workout') {
    const lifts = workout.exercises
      .filter((e) => e.block_type === 'exercise')
      .sort((a, b) => a.sort_order - b.sort_order)
      .slice(0, 2)
      .map((e) => e.name);
    return (
      <ListRow
        icon="dumbbell"
        title={`Today's workout · ${workout.day.day_label}`}
        subtitle={lifts.length > 0 ? lifts.join(' · ') : `${workout.exercises.length} exercises`}
        right={<Badge>Week {workout.weekNum}</Badge>}
        onPress={() => router.navigate({ pathname: '/workout/[dayId]', params: { dayId: workout.day.id } })}
      />
    );
  }
  if (workout.status === 'rest_day') {
    return <ListRow icon="dumbbell" title="Rest day · no workout today" subtitle={`${workout.programName} · Week ${workout.weekNum}, tap to see the week`} onPress={openWeeks} />;
  }
  if (workout.status === 'ended') {
    return <ListRow icon="dumbbell" title="Your programme" subtitle={`${workout.programName} · this block has finished`} onPress={openWeeks} />;
  }
  return <ListRow icon="dumbbell" title="Your programme" subtitle="No programme assigned yet" onPress={openWeeks} />;
}

// The Coach tab, laid out as on the web: your coach, nutrition, training, the daily check-in, progress, then learning and forms.
// Every block that has its own screen switched off for this member (coach switch or membership tier) is left out. Recipes, the
// meal planner and the activity swap are not rows here any more: like the web, they are pills on the Nutrition and Training pages.
export default function Coach() {
  const router = useRouter();
  const { areas } = useScreenAccess();
  const me = useMe().data;
  const unread = useChatUnread(useOwnUserId()).data ?? 0;
  const { profileQ, profile, tz, todayIso, ready, logsQ, todayLog, target } = useDayContext();
  const workoutQ = useTodayWorkout(todayIso, tz, ready);
  const formsQ = usePendingForms();
  const pendingForms = formsQ.data ?? 0;
  const bigDogQ = useBigDogResults();
  const tier = bigDogQ.data ? tierForCount(bigDogCount(bigDogQ.data)) : 'none';

  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    setRefreshing(true);
    await Promise.all([profileQ.refetch(), logsQ.refetch(), workoutQ.refetch(), formsQ.refetch(), bigDogQ.refetch()]);
    setRefreshing(false);
  }

  return (
    <ScrollScreen refreshing={refreshing} onRefresh={refresh}>
      <CoachCard name={me?.coachName ?? 'Your coach'} hasCoach={me?.hasCoach ?? false} unread={unread} />

      {areas.food && profile ? (
        <View>
          <SectionLabel>Nutrition</SectionLabel>
          <NutritionBlock profile={profile} todayLog={todayLog} target={target} todayIso={todayIso} onOpen={() => router.navigate('/food')} />
        </View>
      ) : null}

      {areas.workouts || areas.activity ? (
        <View>
          <SectionLabel>Training</SectionLabel>
          <ListGroup>
            {areas.workouts ? <TrainingRow workout={workoutQ.data} /> : <ListRow icon="activity" title="Activity" subtitle="Swap your steps for another activity" onPress={() => router.navigate('/activity')} />}
          </ListGroup>
        </View>
      ) : null}

      {areas.weeklyLog ? (
        <View>
          <SectionLabel>Daily check-in</SectionLabel>
          <CheckinTiles todayLog={todayLog} />
        </View>
      ) : null}

      <View>
        <SectionLabel>Progress &amp; results</SectionLabel>
        <ListGroup>
          {areas.progress ? <ListRow icon="chartLine" title="Body composition & photos" subtitle="Trends, photos, measurements and scans" onPress={() => router.navigate('/progress')} /> : null}
          <ListRow
            icon="trophy"
            title="Peak week scores"
            subtitle="Your Big Dog standards"
            right={tier === 'none' ? undefined : <Badge>{TIER_TITLE[tier].replace(' Big Dog', '')}</Badge>}
            onPress={() => router.navigate('/bigdog')}
          />
        </ListGroup>
      </View>

      {areas.forms || areas.education ? (
        <View>
          <SectionLabel>Learn &amp; forms</SectionLabel>
          <ListGroup>
            {areas.education ? <ListRow icon="bookOpen" title="Resources" subtitle="Courses and videos from your coach" onPress={() => router.navigate('/learn')} /> : null}
            {areas.forms ? (
              <ListRow
                icon="clipboardList"
                title="Forms"
                subtitle={pendingForms > 0 ? `${pendingForms} to fill out` : 'Questionnaires from your coach'}
                right={pendingForms > 0 ? <CountBadge count={pendingForms} /> : undefined}
                onPress={() => router.navigate('/forms')}
              />
            ) : null}
          </ListGroup>
        </View>
      ) : null}
    </ScrollScreen>
  );
}
