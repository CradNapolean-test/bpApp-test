import { redirect } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentActivity } from '@/lib/data/activity';
import { getGroups } from '@/lib/data/clientGroups';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { CoachNav } from './_components/CoachNav';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachMessagesButton } from './_components/CoachMessagesButton';
import { AddClientForm } from './_components/AddClientForm';
import { ProgramHealth } from './_components/ProgramHealth';
import { ActivityFeed } from './_components/ActivityFeed';
import { ClientSidebar } from './_components/ClientSidebar';
import { ClientTable } from './_components/ClientTable';

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [clients, healthStatuses, chatOverview, activity, groups] = await Promise.all([
    getMyClients(supabase, user.id),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
    getRecentActivity(),
    getGroups(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const needsAttention = healthStatuses.filter((s) => s.status === 'red' || s.status === 'amber').length;

  // profiles has no display-name column for a coach (only clients get one, via
  // client_profiles.name from Setup) -- matches the prototype's own generic "Morning, Coach"
  // greeting rather than inventing a name field that doesn't exist in the schema.
  const todayLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
  const mobileHeader = (
    <Link href="/coach/settings" className="flex min-w-0 items-center gap-2.5">
      <Avatar name={user.email ?? 'Coach'} size="md" />
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">{todayLabel}</p>
        <p className="truncate text-lg font-bold text-black dark:text-zinc-50">Morning, Coach</p>
      </div>
    </Link>
  );

  return (
    <AppShell
      title="Clients"
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={mobileHeader}
      headerAction={<CoachMessagesButton unreadCount={unreadCount} />}
      sidebar={<ClientSidebar clients={clients} statuses={healthStatuses} />}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[#141414] p-4 text-white shadow-[0_1px_2px_rgba(0,0,0,.02)]">
            <p className="text-xs font-medium text-white/60">Active clients</p>
            <p className="mt-1 text-xl font-semibold">{clients.length}</p>
          </div>
          <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
            <p className="text-xs font-medium text-zinc-500">Need attention</p>
            <p className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">{needsAttention}</p>
          </div>
          <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
            <p className="text-xs font-medium text-zinc-500">Unread</p>
            <p className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">{unreadCount}</p>
          </div>
        </div>
        <ActivityFeed events={activity} clients={clients} />
        <ProgramHealth statuses={healthStatuses} />
        <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
          <AddClientForm />
        </div>
        <ClientTable clients={clients} statuses={healthStatuses} groups={groups} />
      </div>
    </AppShell>
  );
}
