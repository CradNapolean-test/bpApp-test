'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
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
        mobileHeader={<CoachMobileBrand />}
      >
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">
          Business
          <ActiveGymTag />
        </h1>
        <p className={`${!canEdit && ADMIN_ONLY_TABS.includes(tab) ? 'mb-1' : 'mb-4'} text-sm text-zinc-500`}>{BLURB[tab]}</p>
        {!canEdit && ADMIN_ONLY_TABS.includes(tab) && <p className="mb-4 text-sm font-medium text-zinc-600 dark:text-zinc-400">{READ_ONLY_NOTE}</p>}
        <HubTabBar label="Business sections" tabs={tabs} active={tab} onSelect={setTab} />

        {tab === 'Overview' && overview && <OverviewPane data={overview} />}
        {tab === 'Plans' && <PackageManager initialPackages={packages} memberCounts={planCounts} countsById={planCountsById} canEdit={canEdit} />}
        {tab === 'Credit packs' && <CreditPackManager initialPacks={creditPacks} usage={packUsage} canEdit={canEdit} />}
        {tab === 'Events' && <EventsPane events={events} past={pastEvents} />}
        {tab === 'Rewards' && <RewardsPane rewards={rewards} shirts={shirts} canEdit={canEdit} />}
        {tab === 'Feedback' && <FeedbackPane feedback={feedback} />}
      </AppShell>
    </ClientOnly>
  );
}
