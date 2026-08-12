'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { ClassManager } from './ClassManager';
import { AttendanceScheduler } from './AttendanceScheduler';
import { PackageManager } from './PackageManager';
import { ReportsPane } from './ReportsPane';
import type { ClassRow, CoachReport, MembershipPackageRow, ScheduleOccurrence } from '@/lib/data/types';

const TABS = ['Manage Classes', 'Take Attendance', 'Membership Packages', 'Reports'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  manage: 'Manage Classes',
  attendance: 'Take Attendance',
  packages: 'Membership Packages',
  reports: 'Reports',
};

export function ClassesHubShell({
  initialClasses,
  occurrences,
  initialPackages,
  report,
  unreadCount,
}: {
  initialClasses: ClassRow[];
  occurrences: ScheduleOccurrence[];
  initialPackages: MembershipPackageRow[];
  report: CoachReport;
  unreadCount: number;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Manage Classes');

  return (
    <AppShell
      title="Classes"
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachMessagesButton unreadCount={unreadCount} />}
    >
      <div className="mb-4 flex gap-1 overflow-x-auto rounded-xl bg-black/5 p-1 dark:bg-white/5">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              tab === t
                ? 'bg-[var(--background)] text-black shadow-[0_1px_3px_rgba(0,0,0,.1)] dark:text-zinc-50'
                : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'Manage Classes' && <ClassManager initialClasses={initialClasses} />}
      {tab === 'Take Attendance' && <AttendanceScheduler occurrences={occurrences} />}
      {tab === 'Membership Packages' && <PackageManager initialPackages={initialPackages} />}
      {tab === 'Reports' && <ReportsPane report={report} />}
    </AppShell>
  );
}
