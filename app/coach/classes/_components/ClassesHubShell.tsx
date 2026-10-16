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
import { TimetableView } from './TimetableView';
import { SessionsView } from './SessionsView';
import { ReportsPane } from './ReportsPane';
import type { ClassRow, CoachReport, ScheduleOccurrence } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

const TABS = ['Sessions', 'Timetable', 'Reports'] as const;
type Tab = (typeof TABS)[number];

// What each tab is called in the address (?tab=...), so a reload or a shared link opens the same tab.
const TAB_SLUG: Record<Tab, string> = { Sessions: 'sessions', Timetable: 'timetable', Reports: 'reports' };

const TAB_PARAM: Record<string, Tab> = {
  manage: 'Timetable',
  schedule: 'Timetable',
  timetable: 'Timetable',
  sessions: 'Sessions',
  attendance: 'Sessions',
  reports: 'Reports',
};

export function ClassesHubShell({
  initialClasses,
  occurrences,
  report,
  unreadCount,
  email,
  clients,
  timezone,
}: {
  initialClasses: ClassRow[];
  occurrences: ScheduleOccurrence[];
  report: CoachReport;
  unreadCount: number;
  email: string;
  clients: CoachClientRow[];
  timezone: string | null;
}) {
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Sessions');
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(TAB_SLUG[next]);
  };

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      mobileHeader={<CoachMobileBrand />}
    >
      <h1 className="mb-4 text-2xl font-bold text-black dark:text-zinc-50">
        Classes
        <ActiveGymTag />
      </h1>
      <HubTabBar label="Classes sections" tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'Sessions' && (
        <SessionsView
          occurrences={occurrences}
          clients={clients}
          timezone={timezone}
          initialTarget={searchParams.get('date') && searchParams.get('class') ? { date: searchParams.get('date')!, classId: searchParams.get('class')! } : null}
        />
      )}
      {tab === 'Timetable' && <TimetableView classes={initialClasses} occurrences={occurrences} timezone={timezone} />}
      {tab === 'Reports' && <ReportsPane report={report} onOpenAttendance={() => setTab('Sessions')} />}
    </AppShell>
    </ClientOnly>
  );
}
