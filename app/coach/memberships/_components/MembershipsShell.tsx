'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { Logo } from '@/app/_components/Logo';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { PackageManager } from '@/app/coach/classes/_components/PackageManager';
import { CreditPackManager } from '@/app/coach/classes/_components/CreditPackManager';
import type { CreditPackRow, MembershipPackageRow } from '@/lib/data/types';

// Membership plans (weekly credits, booking window, which screens a plan unlocks) and one-off
// credit packs. Split out of Classes, which is now only about sessions.
const TABS = ['Packages', 'Credit Packs'] as const;
type Tab = (typeof TABS)[number];

export function MembershipsShell({
  initialPackages,
  initialCreditPacks,
  unreadCount,
  email,
}: {
  initialPackages: MembershipPackageRow[];
  initialCreditPacks: CreditPackRow[];
  unreadCount: number;
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') === 'credit-packs' ? 'Credit Packs' : 'Packages'));

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
      <AppShell
        title={<CoachBrand />}
        topBar={<CoachNav />}
        bottomBar={<CoachBottomTabBar />}
        headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
        mobileHeader={<Logo size={28} />}
      >
        <h1 className="mb-1 text-2xl font-bold text-black dark:text-zinc-50">Memberships</h1>
        <p className="mb-4 text-sm text-zinc-500">
          {tab === 'Packages'
            ? 'Recurring plans: weekly credits, how far ahead members can book, and which screens they get.'
            : 'One-off credit bundles for drop-in members, optionally expiring.'}
        </p>
        <HubTabBar tabs={TABS} active={tab} onSelect={setTab} />

        {tab === 'Packages' && <PackageManager initialPackages={initialPackages} />}
        {tab === 'Credit Packs' && <CreditPackManager initialPacks={initialCreditPacks} />}
      </AppShell>
    </ClientOnly>
  );
}
