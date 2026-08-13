import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { getClientHealthStatuses } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { ClientQuickOverview } from '@/app/coach/_components/ClientQuickOverview';

export default async function CoachClientOverviewPage({
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
    <ClientQuickOverview
      clientId={clientId}
      clientLabel={bundle.profile?.name ?? targetProfile.email}
      healthStatus={healthStatus}
      coachUnreadCount={coachUnreadCount}
      profile={bundle.profile}
      programs={bundle.programs}
      programWeek={bundle.programWeek}
      historyLogs={bundle.historyLogs}
      formTemplates={bundle.formTemplates}
      formAssignments={bundle.formAssignments}
      educationCourses={bundle.educationCourses}
      educationAssignments={bundle.educationAssignments}
    />
  );
}
