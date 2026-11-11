import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getClientHealthStatuses, getMyClients, searchGymClients } from '@/lib/data/coach';
import { getFollowUps } from '@/lib/data/followUps';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { getActiveHoldClientIds } from '@/lib/data/redFlags';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from '../_components/CoachNav';
import { CoachBottomTabBar } from '../_components/CoachBottomTabBar';
import { CoachMobileBrand } from '../_components/CoachMobileBrand';
import { CoachBrand } from '../_components/CoachBrand';
import { CoachHeaderExtras } from '../_components/CoachHeaderExtras';
import { AddClientButton } from '../_components/AddClientButton';
import { ImportClientsButton } from '../_components/ImportClientsButton';
import { ClientsPageMenu } from '../_components/ClientsPageMenu';
import { ClientTable, type QuickFilter } from '../_components/ClientTable';
import { ReviewQueue } from '../_components/ReviewQueue';
import { getClientsNeedingReview } from '@/lib/data/onboarding';

// ?filter= opens a quick filter (the dashboard's "Members to check in on" links to filter=check).
const FILTERS: QuickFilter[] = ['review', 'check', 'quiet', 'credits', 'noplan'];

export default async function CoachClientsPage({ searchParams }: { searchParams: Promise<{ plan?: string; scope?: string; filter?: string }> }) {
  const { plan: initialPlan, scope: initialScope, filter } = await searchParams;
  const initialQuick = FILTERS.find((f) => f === filter) ?? 'all';
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, gym_id, gym:gym_id(name, timezone)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  // The gym's today, as on the dashboard, so both build the same follow-up list.
  const todayIso = todayIsoInTz(gym?.timezone || DEFAULT_TIMEZONE);
  const [clients, gymClients, healthStatuses, chatOverview, groups, reviewQueue, holdIds, followUps] = await Promise.all([
    getMyClients(supabase, user.id),
    searchGymClients(supabase, profile.gym_id, user.id),
    getClientHealthStatuses(supabase, { coachId: user.id, gymId: profile.gym_id }),
    getCoachChatOverview(),
    getGroups(),
    getClientsNeedingReview(profile.gym_id),
    getActiveHoldClientIds().catch(() => [] as string[]),
    getFollowUps(supabase, { coachId: user.id, gymId: profile.gym_id }, todayIso),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);
  const unreadByClient: Record<string, number> = {};
  for (const c of chatOverview) if (c.unread_count > 0) unreadByClient[c.client_id] = c.unread_count;

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      mobileHeader={<CoachMobileBrand />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={user.email ?? 'Coach'} />}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-black dark:text-zinc-50">Clients</h1>
        <div className="flex items-center gap-2">
          <ImportClientsButton />
          <AddClientButton />
          <ClientsPageMenu />
        </div>
      </div>
      <div className="mt-4">
        <ReviewQueue items={reviewQueue} gymName={gym?.name ?? 'the gym'} />
        <ClientTable
          clients={clients}
          gymClients={gymClients}
          gymName={gym?.name ?? 'your gym'}
          statuses={healthStatuses}
          groups={groups}
          holdIds={holdIds}
          initialPlan={initialPlan ?? ''}
          initialScope={initialScope === 'gym' ? 'gym' : 'mine'}
          initialQuick={initialQuick}
          unreadByClient={unreadByClient}
          followUps={followUps.byClient}
          notSetUpIds={followUps.notSetUp}
        />
      </div>
    </AppShell>
    </ClientOnly>
  );
}
