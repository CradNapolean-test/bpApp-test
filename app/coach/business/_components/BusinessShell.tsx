'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { PackageManager } from '@/app/coach/classes/_components/PackageManager';
import { CreditPackManager } from '@/app/coach/classes/_components/CreditPackManager';
import { EventsPane, FeedbackPane, RewardsPane } from '@/app/coach/community/_components/CommunityShell';
import type {
  CreditPackRow,
  EventWithSignup,
  FeedbackRow,
  MembershipPackageRow,
  RewardOverview,
} from '@/lib/data/types';

const TABS = ['Plans', 'Credit packs', 'Events', 'Rewards', 'Feedback'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  plans: 'Plans',
  packages: 'Plans',
  'credit-packs': 'Credit packs',
  events: 'Events',
  rewards: 'Rewards',
  feedback: 'Feedback',
};

const BLURB: Record<Tab, string> = {
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
  feedback,
  rewards,
  unreadCount,
  email,
}: {
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  events: EventWithSignup[];
  feedback: FeedbackRow[];
  rewards: RewardOverview[];
  unreadCount: number;
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Plans');

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        bottomBar={<CoachBottomTabBar />}
        headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
        mobileHeader={<CoachMobileBrand />}
      >
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">Business</h1>
        <p className="mb-4 text-sm text-zinc-500">{BLURB[tab]}</p>
        <HubTabBar tabs={TABS} active={tab} onSelect={setTab} />

        {tab === 'Plans' && <PackageManager initialPackages={packages} />}
        {tab === 'Credit packs' && <CreditPackManager initialPacks={creditPacks} />}
        {tab === 'Events' && <EventsPane events={events} />}
        {tab === 'Rewards' && <RewardsPane rewards={rewards} />}
        {tab === 'Feedback' && <FeedbackPane feedback={feedback} />}
      </AppShell>
    </ClientOnly>
  );
}
