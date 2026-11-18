'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';
import { CoachPageHeader } from '@/app/coach/_components/CoachUi';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { handleTabListKeys } from '@/app/_components/tabKeys';
import { writeTabToUrl } from '@/app/coach/_components/tabUrl';
import { ActiveGymTag } from '@/app/coach/_components/ActiveGymTag';
import { PackageManager } from '@/app/coach/classes/_components/PackageManager';
import { CreditPackManager } from '@/app/coach/classes/_components/CreditPackManager';
import type { ShirtRow } from '@/lib/data/bigDog';
import { EventsPane, FeedbackPane, RewardsPane } from '@/app/coach/community/_components/CommunityShell';
import { OverviewPane } from './OverviewPane';
import type { BusinessOverview } from '@/lib/data/coachDashboard';
import type {
  CreditPackRow,
  EventWithSignup,
  FeedbackRow,
  MembershipPackageRow,
  RewardOverview,
} from '@/lib/data/types';

const ALL_TABS = ['Overview', 'Plans', 'Credit packs', 'Events', 'Rewards', 'Feedback'] as const;
type Tab = (typeof ALL_TABS)[number];

// What each tab is called in the address (?tab=...), so a reload or a shared link opens the same tab.
const TAB_SLUG: Record<Tab, string> = {
  Overview: 'overview',
  Plans: 'plans',
  'Credit packs': 'credit-packs',
  Events: 'events',
  Rewards: 'rewards',
  Feedback: 'feedback',
};

const TAB_PARAM: Record<string, Tab> = {
  overview: 'Overview',
  plans: 'Plans',
  packages: 'Plans',
  'credit-packs': 'Credit packs',
  events: 'Events',
  rewards: 'Rewards',
  feedback: 'Feedback',
};

// Plans, credit packs and rewards are set by a gym admin or the owner (D3); other coaches see them read-only.
const ADMIN_ONLY_TABS: Tab[] = ['Plans', 'Credit packs', 'Rewards'];
const READ_ONLY_NOTE = 'Only a gym admin or the owner can change plans, credit packs and rewards. Ask one of them if something needs changing.';

const BLURB: Record<Tab, string> = {
  Overview: 'How the gym is doing: members, plans, and how each coach\'s members are getting on.',
  Plans: 'Recurring plans: weekly credits, how far ahead members can book, and which screens they get.',
  'Credit packs': 'One-off credit bundles for drop-in members, optionally expiring.',
  Events: 'Gym events members can sign up to (walks, paddles, the Christmas do).',
  Rewards: 'Loyalty gifts members earn by sessions attended or time as a member.',
  Feedback: 'Ratings and comments members have sent.',
};

export function BusinessShell({
  packages,
  creditPacks,
  events,
  pastEvents,
  planCountsById,
  packUsage,
  feedback,
  rewards,
  shirts,
  overview,
  canEdit,
  userId,
  unreadCount,
  email,
}: {
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  events: EventWithSignup[];
  pastEvents: EventWithSignup[];
  // Members on each plan by plan id (null until migration 0101 is run), and how often each credit pack was granted.
  planCountsById: Record<string, number> | null;
  packUsage: Record<string, { times: number; last: string | null }> | null;
  feedback: FeedbackRow[];
  rewards: RewardOverview[];
  shirts: ShirtRow[];
  // Gym owners and managers only; null hides the Overview tab.
  overview: BusinessOverview | null;
  // An admin of this gym (or the owner): may add, edit and delete plans, credit packs and rewards.
  canEdit: boolean;
  // The signed-in coach: Edit and Delete show on the events they added (and on every event when canEdit, decision of 11 Nov).
  userId: string;
  unreadCount: number;
  email: string;
}) {
  const searchParams = useSearchParams();
  const tabs = overview ? ALL_TABS : ALL_TABS.filter((t) => t !== 'Overview');
  const [tab, setTabState] = useState<Tab>(() => {
    const wanted = TAB_PARAM[searchParams.get('tab') ?? ''];
    if (wanted && (wanted !== 'Overview' || overview)) return wanted;
    return overview ? 'Overview' : 'Plans';
  });
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(TAB_SLUG[next]);
  };
  const planCounts = Object.fromEntries((overview?.plans ?? []).map((p) => [p.name, p.count]));

  return (
    <ClientOnly fallback={<PageSkeleton />}>
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        bottomBar={<CoachBottomTabBar />}
        headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      coachSidebar={<CoachSidebar unreadCount={unreadCount} email={email} />}
        mobileHeader={<CoachMobileBrand />}
      >
        <CoachPageHeader
          eyebrow={BLURB[tab]}
          title={
            <>
              Business
              <ActiveGymTag />
            </>
          }
          actions={
            <div className="hidden sm:block">
              <HubTabBar label="Business sections" tabs={tabs} active={tab} onSelect={setTab} />
            </div>
          }
        />
        <div className="mt-4" />
        {!canEdit && ADMIN_ONLY_TABS.includes(tab) && <p className="mb-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">{READ_ONLY_NOTE}</p>}
        {/* Six tabs are wider than a phone, and the scrolling row cut the last one to "Feedba" (DB23). On a phone they sit in a grid of
            three a row, all in view; from the sm width up it is the usual tab row. */}
        <div role="tablist" aria-label="Business sections" onKeyDown={handleTabListKeys} className="mb-4 grid grid-cols-3 gap-1.5 sm:hidden">
          {tabs.map((t) => (
            <button
              key={t}
              type="button"
              role="tab"
              aria-selected={tab === t}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={`min-h-11 rounded-xl px-2 text-sm font-bold transition-colors ${
                tab === t ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black dark:border-white/15 dark:text-zinc-50'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="mb-2" />

        {tab === 'Overview' && overview && <OverviewPane data={overview} />}
        {tab === 'Plans' && <PackageManager initialPackages={packages} memberCounts={planCounts} countsById={planCountsById} canEdit={canEdit} />}
        {tab === 'Credit packs' && <CreditPackManager initialPacks={creditPacks} usage={packUsage} canEdit={canEdit} />}
        {tab === 'Events' && <EventsPane events={events} past={pastEvents} userId={userId} canManageAll={canEdit} />}
        {tab === 'Rewards' && <RewardsPane rewards={rewards} shirts={shirts} canEdit={canEdit} />}
        {tab === 'Feedback' && <FeedbackPane feedback={feedback} />}
      </AppShell>
    </ClientOnly>
  );
}
