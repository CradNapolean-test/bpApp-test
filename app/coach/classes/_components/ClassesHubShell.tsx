'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { Logo } from '@/app/_components/Logo';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { HubTabBar } from '@/app/coach/_components/HubTabBar';
import { ClassManager } from './ClassManager';
import { AttendanceScheduler } from './AttendanceScheduler';
import { PackageManager } from './PackageManager';
import { ReportsPane } from './ReportsPane';
import type { ClassRow, CoachReport, MembershipPackageRow, ScheduleOccurrence } from '@/lib/data/types';

const TABS = ['Manage', 'Attendance', 'Packages', 'Reports'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  manage: 'Manage',
  attendance: 'Attendance',
  packages: 'Packages',
  reports: 'Reports',
};

export function ClassesHubShell({
  initialClasses,
  occurrences,
  initialPackages,
  report,
  unreadCount,
  email,
}: {
  initialClasses: ClassRow[];
  occurrences: ScheduleOccurrence[];
  initialPackages: MembershipPackageRow[];
  report: CoachReport;
  unreadCount: number;
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Manage');

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      mobileHeader={<Logo size={28} />}
    >
      <h1 className="mb-4 text-2xl font-bold text-black dark:text-zinc-50">Classes</h1>
      <HubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'Manage' && <ClassManager initialClasses={initialClasses} />}
      {tab === 'Attendance' && <AttendanceScheduler occurrences={occurrences} />}
      {tab === 'Packages' && <PackageManager initialPackages={initialPackages} />}
      {tab === 'Reports' && <ReportsPane report={report} />}
    </AppShell>
  );
}
