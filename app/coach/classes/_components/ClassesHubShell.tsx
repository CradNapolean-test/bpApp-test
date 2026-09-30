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
import { ClassManager } from './ClassManager';
import { AttendanceScheduler } from './AttendanceScheduler';
import { ReportsPane } from './ReportsPane';
import type { ClassRow, CoachReport, ScheduleOccurrence } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

const TABS = ['Schedule', 'Attendance', 'Reports'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  manage: 'Schedule',
  schedule: 'Schedule',
  attendance: 'Attendance',
  reports: 'Reports',
};

export function ClassesHubShell({
  initialClasses,
  occurrences,
  report,
  unreadCount,
  email,
  clients,
}: {
  initialClasses: ClassRow[];
  occurrences: ScheduleOccurrence[];
  report: CoachReport;
  unreadCount: number;
  email: string;
  clients: CoachClientRow[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Schedule');

  return (
    <ClientOnly fallback={<div className="min-h-screen" />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      mobileHeader={<CoachMobileBrand />}
    >
      <h1 className="mb-4 text-2xl font-bold text-black dark:text-zinc-50">Classes</h1>
      <HubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'Schedule' && <ClassManager initialClasses={initialClasses} />}
      {tab === 'Attendance' && <AttendanceScheduler occurrences={occurrences} clients={clients} />}
      {tab === 'Reports' && <ReportsPane report={report} onOpenAttendance={() => setTab('Attendance')} />}
    </AppShell>
    </ClientOnly>
  );
}
