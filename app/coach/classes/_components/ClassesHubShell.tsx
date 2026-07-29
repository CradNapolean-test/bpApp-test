'use client';

import { useState } from 'react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { ClassManager } from './ClassManager';
import { AttendanceScheduler } from './AttendanceScheduler';
import { PackageManager } from './PackageManager';
import type { ClassRow, MembershipPackageRow, ScheduleOccurrence } from '@/lib/data/types';

const TABS = ['Manage Classes', 'Take Attendance', 'Membership Packages'] as const;
type Tab = (typeof TABS)[number];

export function ClassesHubShell({
  initialClasses,
  occurrences,
  initialPackages,
}: {
  initialClasses: ClassRow[];
  occurrences: ScheduleOccurrence[];
  initialPackages: MembershipPackageRow[];
}) {
  const [tab, setTab] = useState<Tab>('Manage Classes');

  return (
    <AppShell
      title="Classes"
      topBar={<CoachNav />}
      sidebar={
        <nav className="space-y-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-foreground text-background'
                  : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      }
    >
      {tab === 'Manage Classes' && <ClassManager initialClasses={initialClasses} />}
      {tab === 'Take Attendance' && <AttendanceScheduler occurrences={occurrences} />}
      {tab === 'Membership Packages' && <PackageManager initialPackages={initialPackages} />}
    </AppShell>
  );
}
