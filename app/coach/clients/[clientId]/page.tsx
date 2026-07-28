import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
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

  const bundle = await loadDashboardBundle(clientId, false);

  return (
    <DashboardShell
      clientId={clientId}
      clientLabel={bundle.profile?.name ?? targetProfile.email}
      isCoachView={true}
      profile={bundle.profile}
      weekDates={bundle.weekDates}
      weekLogs={bundle.weekLogs}
      historyLogs={bundle.historyLogs}
      todayLogId={bundle.todayLogId}
      foodDiaryEntries={bundle.foodDiaryEntries}
      mealPlanEntries={bundle.mealPlanEntries}
      activities={bundle.activities}
      programWeek={bundle.programWeek}
    />
  );
}
