import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients, searchGymClients } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '../_components/CoachNav';
import { CoachBottomTabBar } from '../_components/CoachBottomTabBar';
import { CoachBrand } from '../_components/CoachBrand';
import { CoachHeaderExtras } from '../_components/CoachHeaderExtras';
import { AddClientButton } from '../_components/AddClientButton';
import { ImportClientsButton } from '../_components/ImportClientsButton';
import { ClientTable } from '../_components/ClientTable';

export default async function CoachClientsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, gym_id, gym:gym_id(name)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  const [clients, gymClients, healthStatuses, chatOverview, groups] = await Promise.all([
    getMyClients(supabase, user.id),
    searchGymClients(supabase, profile.gym_id, user.id),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
    getGroups(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">Clients</h1>
        <div className="flex items-center gap-2">
          <ImportClientsButton />
          <AddClientButton />
        </div>
      </div>
      <div className="mt-4">
        <ClientTable
          clients={clients}
          gymClients={gymClients}
          gymName={gym?.name ?? 'your gym'}
          statuses={healthStatuses}
          groups={groups}
        />
      </div>
    </AppShell>
  );
}
