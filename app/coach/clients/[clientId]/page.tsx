import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { getClientHealthStatuses } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getJournalEntries } from '@/lib/data/clientJournal';
import { DashboardShell } from '@/app/dashboard/_components/DashboardShell';

export default async function CoachClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role, theme_preference')
    .eq('id', user.id)
    .single();
  if (callerProfile?.role !== 'coach') redirect('/dashboard');

  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', clientId)
    .eq('coach_id', user.id)
    .maybeSingle();
  if (!targetProfile) redirect('/coach');

  const [bundle, healthStatuses, chatOverview, journalEntries] = await Promise.all([
    loadDashboardBundle(clientId, false),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
    getJournalEntries(clientId),
  ]);
  const healthStatus = healthStatuses.find((s) => s.clientId === clientId) ?? null;
  const coachUnreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  // Distinct from coachUnreadCount (the sum across every client, for the global inbox link) --
  // this scopes to just the thread with the client being viewed, for the header Messages icon.
  const perClientUnreadCount = chatOverview.find((c) => c.client_id === clientId)?.unread_count ?? 0;

  return (
    <DashboardShell
      clientId={clientId}
      clientLabel={bundle.profile?.name ?? targetProfile.email}
      isCoachView={true}
      healthStatus={healthStatus}
      coachUnreadCount={coachUnreadCount}
      perClientUnreadCount={perClientUnreadCount}
      currentUserId={user.id}
      currentUserEmail={user.email ?? ''}
      themePreference={(callerProfile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
      journalEntries={journalEntries}
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
      programs={bundle.programs}
      workoutLogs={bundle.workoutLogs}
      clientExerciseMaxes={bundle.clientExerciseMaxes}
      workoutDayFeedback={bundle.workoutDayFeedback}
      membership={bundle.membership}
      packages={bundle.packages}
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
      unreadMessageCount={bundle.unreadMessageCount}
    />
  );
}
