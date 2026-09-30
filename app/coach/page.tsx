import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients, getRosterHabitAdherence } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentActivity } from '@/lib/data/activity';
import { getScheduleOccurrences } from '@/lib/data/classes';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { CoachNav } from './_components/CoachNav';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachBrand } from './_components/CoachBrand';
import { CoachHeaderExtras } from './_components/CoachHeaderExtras';
import { CoachTimeGreeting } from './_components/CoachGreeting';
import { AddClientForm } from './_components/AddClientForm';
import { ProgramHealth } from './_components/ProgramHealth';
import { HabitAdherence } from './_components/HabitAdherence';
import { ActivityFeed } from './_components/ActivityFeed';
import { TodaySessions } from './_components/TodaySessions';
import { CoachMobileBrand } from './_components/CoachMobileBrand';
import { Card } from '@/app/_components/ui';

export default async function CoachPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  // maybeSingle, not single -- and redirect to '/' (which explicitly handles a missing
  // profile), not straight to '/dashboard' -- redirecting directly between the two role pages
  // is what turned "no profile exists yet" into an actual infinite loop. See app/page.tsx.
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'coach') redirect('/');

  const [clients, healthStatuses, habitAdherence, chatOverview, activity, occurrences] = await Promise.all([
    getMyClients(supabase, user.id),
    getClientHealthStatuses(supabase, user.id),
    getRosterHabitAdherence(supabase, user.id),
    getCoachChatOverview(),
    getRecentActivity(),
    getScheduleOccurrences(),
  ]);

  // The activity feed is gym-wide, so it includes clients of other coaches -- look their names up
  // too, otherwise those rows read "A client".
  const knownIds = new Set(clients.map((c) => c.id));
  const unknownIds = [...new Set(activity.map((e) => e.client_id))].filter((id) => !knownIds.has(id));
  const { data: extraProfiles } = unknownIds.length
    ? await supabase.from('client_profiles').select('client_id, name').in('client_id', unknownIds)
    : { data: [] as { client_id: string; name: string | null }[] };
  const extraNames: Record<string, string> = {};
  for (const p of extraProfiles ?? []) if (p.name) extraNames[p.client_id] = p.name;
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const needsAttention = healthStatuses.filter((s) => s.status === 'red' || s.status === 'amber').length;

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={<CoachMobileBrand />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">
          <CoachTimeGreeting />
        </h1>
        <div className="grid grid-cols-3 gap-3">
          <Card tone="accent" className="!p-3.5">
            <p className="text-xs font-medium text-zinc-500">Active clients</p>
            <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{clients.length}</p>
          </Card>
          <Card className="!p-3.5">
            <p className="text-xs font-medium text-zinc-500">Need attention</p>
            <p className="mt-1 text-2xl font-extrabold text-danger">{needsAttention}</p>
          </Card>
          <Card className="!p-3.5">
            <p className="text-xs font-medium text-zinc-500">Unread messages</p>
            <p className="mt-1 text-2xl font-extrabold text-black dark:text-zinc-50">{unreadCount}</p>
          </Card>
        </div>
        <TodaySessions occurrences={occurrences} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <ActivityFeed events={activity} clients={clients} extraNames={extraNames} />
          <div className="rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
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
    </ClientOnly>
  );
}
