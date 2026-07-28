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
