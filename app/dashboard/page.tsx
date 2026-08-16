import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { DashboardShell } from './_components/DashboardShell';

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
      membership={bundle.membership}
      packages={bundle.packages}
      creditPacks={bundle.creditPacks}
      photos={bundle.photos}
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
      unreadMessageCount={bundle.unreadMessageCount}
    />
  );
}
