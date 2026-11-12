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
import { ReportsPane, reportSectionFromParam } from './ReportsPane';
import { RedFlagsView } from './RedFlagsView';
import type { ClassRow, CoachReport, ScheduleOccurrence } from '@/lib/data/types';
import type { CoachClientRow } from '@/lib/data/coach';

const TABS = ['Sessions', 'Timetable', 'Red flags', 'Reports'] as const;
type Tab = (typeof TABS)[number];

// What each tab is called in the address (?tab=...), so a reload or a shared link opens the same tab.
const TAB_SLUG: Record<Tab, string> = { Sessions: 'sessions', Timetable: 'timetable', 'Red flags': 'red-flags', Reports: 'reports' };

const TAB_PARAM: Record<string, Tab> = {
  manage: 'Timetable',
  schedule: 'Timetable',
  timetable: 'Timetable',
  sessions: 'Sessions',
  attendance: 'Sessions',
  'red-flags': 'Red flags',
  reports: 'Reports',
};

// Red flags was a section of Reports until D12; an old link (?tab=reports&section=red-flags, the coach dashboard's) opens the tab.
// A plain ?tab=reports opens Reports on its Overview, so nothing lands on Red flags by accident.
export function classesTabFromParams(tab: string | null, section: string | null): Tab {
  if (tab === 'reports' && section === 'red-flags') return 'Red flags';
  return TAB_PARAM[tab ?? ''] ?? 'Sessions';
}

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
  const [tab, setTabState] = useState<Tab>(() => classesTabFromParams(searchParams.get('tab'), searchParams.get('section')));
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(TAB_SLUG[next]);
    // The old dashboard link's section=red-flags would send a reload of ?tab=reports back to Red flags; drop it once the coach moves on.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get('section') === 'red-flags') {
        url.searchParams.delete('section');
        window.history.replaceState(window.history.state, '', url.toString());
      }
    } catch {
      // An address that cannot be rewritten only matters on reload.
    }
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
          initialDate={searchParams.get('date')}
        />
      )}
      {tab === 'Timetable' && <TimetableView classes={initialClasses} occurrences={occurrences} timezone={timezone} />}
      {tab === 'Red flags' && <RedFlagsView onOpenAttendance={() => setTab('Sessions')} />}
      {tab === 'Reports' && (
        <ReportsPane report={report} onOpenAttendance={() => setTab('Sessions')} initialSection={reportSectionFromParam(searchParams.get('section'))} />
      )}
    </AppShell>
    </ClientOnly>
  );
}
