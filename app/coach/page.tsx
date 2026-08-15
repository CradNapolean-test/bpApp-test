import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients, getRosterHabitAdherence } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentActivity } from '@/lib/data/activity';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from './_components/CoachNav';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachBrand } from './_components/CoachBrand';
import { CoachHeaderExtras } from './_components/CoachHeaderExtras';
import { AddClientForm } from './_components/AddClientForm';
import { ProgramHealth } from './_components/ProgramHealth';
import { HabitAdherence } from './_components/HabitAdherence';
import { ActivityFeed } from './_components/ActivityFeed';

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

  const [clients, healthStatuses, habitAdherence, chatOverview, activity] = await Promise.all([
    getMyClients(supabase, user.id),
    getClientHealthStatuses(supabase, user.id),
    getRosterHabitAdherence(supabase, user.id),
    getCoachChatOverview(),
    getRecentActivity(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const needsAttention = healthStatuses.filter((s) => s.status === 'red' || s.status === 'amber').length;

  // profiles has no display-name column for a coach (only clients get one, via
  // client_profiles.name from Setup) -- matches the prototype's own generic "{Greeting}, Coach"
  // greeting rather than inventing a name field that doesn't exist in the schema.
  const todayLabel = new Date()
    .toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
    .toUpperCase();
  const greetingHour = new Date().getHours();
  const timeGreeting = greetingHour < 12 ? 'Morning' : greetingHour < 18 ? 'Afternoon' : 'Evening';
  const mobileHeader = (
    <div className="min-w-0">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-zinc-500">{todayLabel}</p>
      <p className="truncate text-lg font-bold text-black dark:text-zinc-50">{timeGreeting}, Coach</p>
    </div>
  );

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={mobileHeader}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <div className="space-y-4">
        <h1 className="hidden text-2xl font-bold text-black dark:text-zinc-50 md:block">{timeGreeting}, Coach</h1>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl bg-[#141414] p-4 text-white shadow-[0_1px_2px_rgba(0,0,0,.02)]">
            <p className="text-xs font-medium text-white/60">Active clients</p>
            <p className="mt-1 text-xl font-semibold">{clients.length}</p>
          </div>
          <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
            <p className="text-xs font-medium text-zinc-500">Need attention</p>
            <p className="mt-1 text-xl font-semibold text-red-600 dark:text-red-400">{needsAttention}</p>
          </div>
          <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
            <p className="text-xs font-medium text-zinc-500">Unread messages</p>
            <p className="mt-1 text-xl font-semibold text-black dark:text-zinc-50">{unreadCount}</p>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <ActivityFeed events={activity} clients={clients} />
          <div className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
            <h3 className="font-bold text-black dark:text-zinc-50">Add client</h3>
            <div className="mt-2">
              <AddClientForm />
            </div>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ProgramHealth statuses={healthStatuses} />
          <HabitAdherence adherence={habitAdherence} />
        </div>
      </div>
    </AppShell>
  );
}
