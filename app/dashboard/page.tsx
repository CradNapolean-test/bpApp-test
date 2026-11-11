import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCurrentUser, getMyProfileRow } from '@/lib/supabase/currentUser';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { DashboardShell } from './_components/DashboardShell';
import { OnboardingFlow } from './_components/OnboardingFlow';

export default async function DashboardPage() {
  // The sign-in check and the profile row are shared with the root layout (one of each per request).
  const user = await getCurrentUser();
  if (!user) redirect('/login');

  // maybeSingle, not single -- and redirect to '/' (which explicitly handles a missing
  // profile), not straight to '/coach' -- redirecting directly between the two role pages is
  // what turned "no profile exists yet" into an actual infinite loop. See app/page.tsx.
  const profile = await getMyProfileRow();
  if (!profile || profile.role !== 'client') redirect('/');

  const bundle = await loadDashboardBundle(user.id, true);

  // New members (no profile row yet, or onboarding not finished) get the onboarding flow first.
  // Strict null, not falsy: undefined means the onboarding migration isn't applied yet.
  if (!bundle.profile || bundle.profile.onboarding_completed_at === null) {
    // A member cannot read their coach's profile row (the access rules return nothing), so reading it through profiles.coach_id always
    // gave "Your coach". The narrow get_my_coach_display_name() read (migration 0042) is what the member's chat uses too.
    const supabase = await createClient();
    const { data: coachName } = await supabase.rpc('get_my_coach_display_name');
    const coachFirstName = typeof coachName === 'string' ? coachName.trim().split(/\s+/)[0] || null : null;
    return <OnboardingFlow clientId={user.id} email={profile.email} existing={bundle.profile} coachFirstName={coachFirstName} />;
  }

  return (
    <DashboardShell
      clientId={user.id}
      clientLabel={bundle.profile?.name ?? profile.email}
      isCoachView={false}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ''}
      themePreference={(profile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
      profile={bundle.profile}
      weekDates={bundle.weekDates}
      weekLogs={bundle.weekLogs}
      historyLogs={bundle.historyLogs}
      todayLogId={bundle.todayLogId}
      foodDiaryEntries={bundle.foodDiaryEntries}
      foodPhotos={bundle.foodPhotos}
      manualMacroEntries={bundle.manualMacroEntries}
      mealPlanEntries={bundle.mealPlanEntries}
      mealSections={bundle.mealSections}
      activities={bundle.activities}
      programWeek={bundle.programWeek}
      streak={bundle.streak}
      gymBlackout={bundle.gymBlackout}
      messages={bundle.messages}
      bookings={bundle.bookings}
      creditsBalance={bundle.creditsBalance}
      creditsBuckets={bundle.creditsBuckets}
      programs={bundle.programs}
      workoutLogs={bundle.workoutLogs}
      clientExerciseMaxes={bundle.clientExerciseMaxes}
      workoutDayFeedback={bundle.workoutDayFeedback}
      blockChoices={bundle.blockChoices}
      blockResults={bundle.blockResults}
      membership={bundle.membership}
      packages={bundle.packages}
      creditPacks={bundle.creditPacks}
      photos={bundle.photos}
      bodyScans={bundle.bodyScans}
      nutritionFeedback={bundle.nutritionFeedback}
      measurementLogs={bundle.measurementLogs}
      notifications={bundle.notifications}
      formTemplates={bundle.formTemplates}
      formAssignments={bundle.formAssignments}
      exerciseLibrary={bundle.exerciseLibrary}
      programTemplates={bundle.programTemplates}
      recipes={bundle.recipes}
      // Hidden for a gym with no referral link (R16, D7).
      disabledScreens={bundle.referralUrl ? bundle.disabledScreens : [...bundle.disabledScreens, 'Refer a Friend']}
      referralUrl={bundle.referralUrl}
      disabledMetrics={bundle.disabledMetrics}
      bigDogResults={bundle.bigDogResults}
      events={bundle.events}
      rewardsData={bundle.rewardsData}
      unreadMessageCount={bundle.unreadMessageCount}
    />
  );
}
