import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { DashboardShell } from './_components/DashboardShell';
import { OnboardingFlow } from './_components/OnboardingFlow';

export default async function DashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // maybeSingle, not single -- and redirect to '/' (which explicitly handles a missing
  // profile), not straight to '/coach' -- redirecting directly between the two role pages is
  // what turned "no profile exists yet" into an actual infinite loop. See app/page.tsx.
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email, theme_preference')
    .eq('id', user.id)
    .maybeSingle();
  if (!profile || profile.role !== 'client') redirect('/');

  const bundle = await loadDashboardBundle(user.id, true);

  // New members (no profile row yet, or onboarding not finished) get the onboarding flow first.
  // Strict null, not falsy: undefined means the onboarding migration isn't applied yet.
  if (!bundle.profile || bundle.profile.onboarding_completed_at === null) {
    const { data: me } = await supabase.from('profiles').select('coach:coach_id(display_name)').eq('id', user.id).maybeSingle();
    const coach = Array.isArray(me?.coach) ? me.coach[0] : me?.coach;
    return (
      <OnboardingFlow
        clientId={user.id}
        email={profile.email}
        existing={bundle.profile}
        coachFirstName={(coach as { display_name?: string | null } | null)?.display_name?.split(' ')[0] ?? null}
      />
    );
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
      messages={bundle.messages}
      bookings={bundle.bookings}
      occurrences={bundle.occurrences}
      creditsBalance={bundle.creditsBalance}
      creditsBuckets={bundle.creditsBuckets}
      creditsLedger={bundle.creditsLedger}
      programs={bundle.programs}
      workoutLogs={bundle.workoutLogs}
      clientExerciseMaxes={bundle.clientExerciseMaxes}
      workoutDayFeedback={bundle.workoutDayFeedback}
      blockChoices={bundle.blockChoices}
      membership={bundle.membership}
      packages={bundle.packages}
      creditPacks={bundle.creditPacks}
      photos={bundle.photos}
      bodyScans={bundle.bodyScans}
      nutritionFeedback={bundle.nutritionFeedback}
      measurementLogs={bundle.measurementLogs}
      habits={bundle.habits}
      notifications={bundle.notifications}
      formTemplates={bundle.formTemplates}
      formAssignments={bundle.formAssignments}
      exerciseLibrary={bundle.exerciseLibrary}
      programTemplates={bundle.programTemplates}
      recipes={bundle.recipes}
      educationCourses={bundle.educationCourses}
      educationAssignments={bundle.educationAssignments}
      disabledScreens={bundle.disabledScreens}
      bigDogResults={bundle.bigDogResults}
      events={bundle.events}
      rewardsData={bundle.rewardsData}
      unreadMessageCount={bundle.unreadMessageCount}
    />
  );
}
