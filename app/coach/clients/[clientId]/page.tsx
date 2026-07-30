import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { getClientHealthStatuses } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
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
    .select('role')
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

  const [bundle, healthStatuses, chatOverview] = await Promise.all([
    loadDashboardBundle(clientId, false),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
  ]);
  const healthStatus = healthStatuses.find((s) => s.clientId === clientId) ?? null;
  const coachUnreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <DashboardShell
        clientId={clientId}
        clientLabel={bundle.profile?.name ?? targetProfile.email}
        isCoachView={true}
        healthStatus={healthStatus}
        coachUnreadCount={coachUnreadCount}
        currentUserId={user.id}
        profile={bundle.profile}
        weekDates={bundle.weekDates}
        weekLogs={bundle.weekLogs}
        historyLogs={bundle.historyLogs}
        todayLogId={bundle.todayLogId}
        foodDiaryEntries={bundle.foodDiaryEntries}
        mealPlanEntries={bundle.mealPlanEntries}
        activities={bundle.activities}
        programWeek={bundle.programWeek}
        messages={bundle.messages}
        bookings={bundle.bookings}
        occurrences={bundle.occurrences}
        creditsBalance={bundle.creditsBalance}
        programs={bundle.programs}
        workoutLogs={bundle.workoutLogs}
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
        educationContent={bundle.educationContent}
        educationAssignments={bundle.educationAssignments}
      />
  );
}
