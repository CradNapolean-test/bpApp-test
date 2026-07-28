import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { DashboardShell } from '@/app/dashboard/_components/DashboardShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';

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
    <>
      <div className="mx-auto w-full max-w-4xl px-6 pt-6">
        <CoachNav />
      </div>
      <DashboardShell
        clientId={clientId}
        clientLabel={bundle.profile?.name ?? targetProfile.email}
        isCoachView={true}
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
      />
    </>
  );
}
