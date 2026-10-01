import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients } from '@/lib/data/coach';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getRecentActivity } from '@/lib/data/activity';
import { getScheduleOccurrences } from '@/lib/data/classes';
import { getBigDogToVerify, getDeletionRequests } from '@/lib/data/coachAttention';
import { getClientsNeedingReview } from '@/lib/data/onboarding';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { CoachNav } from './_components/CoachNav';
import { CoachBottomTabBar } from './_components/CoachBottomTabBar';
import { CoachBrand } from './_components/CoachBrand';
import { CoachHeaderExtras } from './_components/CoachHeaderExtras';
import { CoachTimeGreeting } from './_components/CoachGreeting';
import { AddClientForm } from './_components/AddClientForm';
import { ActivityFeed } from './_components/ActivityFeed';
import { TodayOverview } from './_components/TodayOverview';
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

  const [clients, healthStatuses, chatOverview, activity, occurrences, newMembers, toVerify, deletionRequests] = await Promise.all([
    getMyClients(supabase, user.id),
    getClientHealthStatuses(supabase, user.id),
    getCoachChatOverview(),
    getRecentActivity(),
    getScheduleOccurrences(1, 2),
    getClientsNeedingReview(),
    getBigDogToVerify(),
    getDeletionRequests(),
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
        {/* Phone: one column -- today, attention, activity, habits. Wide screen: today and attention on
            the left, activity and "add client" on the right. */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_24rem]">
          <TodayOverview
            occurrences={occurrences}
            unreadCount={unreadCount}
            flagged={healthStatuses.filter((s) => s.status === 'red' || s.status === 'amber')}
            newMembers={newMembers}
            toVerify={toVerify}
            deletionRequests={deletionRequests}
          />
          <div className="space-y-4">
            <ActivityFeed events={activity} clients={clients} extraNames={extraNames} />
            <div className="hidden lg:block">
              <Card>
                <h3 className="font-bold text-black dark:text-zinc-50">Add client</h3>
                <div className="mt-2">
                  <AddClientForm />
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
    </ClientOnly>
  );
}
