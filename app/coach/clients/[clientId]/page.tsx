import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { loadDashboardBundle } from '@/lib/data/dashboardBundle';
import { getClientHealthStatuses } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getJournalEntries } from '@/lib/data/clientJournal';
import { getRecentActivity } from '@/lib/data/activity';
import { CoachClientWorkspace } from '@/app/coach/_components/CoachClientWorkspace';

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

  const { data: callerProfile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (callerProfile?.role !== 'coach') redirect('/dashboard');

  // Not restricted to coach_id = user.id -- RLS (is_same_gym_as_client, 0052/0053) now also
  // lets a coach read a colleague's client at the same gym for read-only viewing. A client
  // outside the caller's gym simply returns no row (RLS default-deny), same as before.
  const { data: targetProfile } = await supabase
    .from('profiles')
    .select('email, coach_id')
    .eq('id', clientId)
    .eq('role', 'client')
    .maybeSingle();
  if (!targetProfile) redirect('/coach/clients');
  const isOwnClient = targetProfile.coach_id === user.id;

  const [bundle, healthStatuses, chatOverview, journalEntries, activity] = await Promise.all([
    loadDashboardBundle(clientId, false),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
    getJournalEntries(clientId),
    getRecentActivity(clientId),
  ]);
  const healthStatus = healthStatuses.find((s) => s.clientId === clientId) ?? null;
  const coachUnreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <CoachClientWorkspace
      clientId={clientId}
      clientLabel={bundle.profile?.name ?? targetProfile.email}
      clientEmail={targetProfile.email}
      isOwnClient={isOwnClient}
      healthStatus={healthStatus}
      coachUnreadCount={coachUnreadCount}
      coachEmail={user.email ?? 'Coach'}
      profile={bundle.profile}
      journalEntries={journalEntries}
      bookings={bundle.bookings}
      programs={bundle.programs}
      formAssignments={bundle.formAssignments}
      educationAssignments={bundle.educationAssignments}
      habits={bundle.habits}
      activity={activity}
      disabledScreens={bundle.disabledScreens}
      clientExerciseMaxes={bundle.clientExerciseMaxes}
      exerciseLibrary={bundle.exerciseLibrary}
    />
  );
}
