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

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, email')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'client') redirect('/coach');

  const bundle = await loadDashboardBundle(user.id, true);

  return (
    <DashboardShell
      clientId={user.id}
      clientLabel={bundle.profile?.name ?? profile.email}
      isCoachView={false}
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
      classes={bundle.classes}
      bookings={bundle.bookings}
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
    />
  );
}
