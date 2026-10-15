import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { getClientLastActive, getCoachDisplayName, getCoachUnreadForClient, getCoachUnreadTotal, getLatestWeighIn, memberHealthStatus } from '@/lib/data/coach';
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

  // Not restricted to coach_id = user.id -- RLS (is_same_gym_as_client, 0052/0053) now also
  // lets a coach read a colleague's client at the same gym. isCoachView already renders most
  // of this dashboard read-only for ANY coach viewing it (see readOnly={isCoachView} below);
  // isOwnClient narrows the few coach-action affordances that aren't already covered by that.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('email, coach_id, created_at')
    .eq('id', clientId)
    .eq('role', 'client')
    .maybeSingle();
  if (!targetProfile) redirect('/coach/clients');
  const isOwnClient = targetProfile.coach_id === user.id;

  const [bundle, lastActive, coachUnreadCount, perClientUnreadCount, journalEntries, latestWeighIn, ownerCoachName] = await Promise.all([
    loadDashboardBundle(clientId, false),
    getClientLastActive(supabase, clientId),
    // The sum across every client, for the global inbox link...
    getCoachUnreadTotal(supabase),
    // ...and just the thread with the client being viewed, for the header Messages icon.
    getCoachUnreadForClient(supabase, clientId),
    getJournalEntries(clientId),
    getLatestWeighIn(supabase, clientId),
    // Only needed to say whose member this is when it is a colleague's.
    isOwnClient ? Promise.resolve(null) : getCoachDisplayName(supabase, targetProfile.coach_id as string | null),
  ]);
  // Built from what this page already has plus one narrow query for the last log, not the roster's statuses.
  const healthStatus = memberHealthStatus({
    clientId,
    name: bundle.profile?.name ?? targetProfile.email,
    createdAt: targetProfile.created_at as string,
    reminderDays: bundle.profile?.checkin_reminder_days,
    timezone: bundle.profile?.timezone,
    lastActive,
  });

  return (
    <DashboardShell
      clientId={clientId}
      clientLabel={bundle.profile?.name ?? targetProfile.email}
      isCoachView={true}
      isOwnClient={isOwnClient}
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
      unreadMessageCount={bundle.unreadMessageCount}
      gymTimezone={bundle.gymTimezone}
      latestWeighIn={latestWeighIn}
      ownerCoachName={ownerCoachName}
      bigDogResults={bundle.bigDogResults}
      events={bundle.events}
      rewardsData={bundle.rewardsData}
      disabledScreens={bundle.disabledScreens}
      disabledMetrics={bundle.disabledMetrics}
    />
  );
}
