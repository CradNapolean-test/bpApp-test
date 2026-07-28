'use client';

import { useState } from 'react';
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
    <div>
      <nav className="flex flex-wrap gap-1 border-b border-black/10 dark:border-white/10">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`rounded-t-md px-3 py-2 text-sm font-medium transition-colors ${
              tab === t
                ? 'border-b-2 border-foreground text-black dark:text-zinc-50'
                : 'text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {t}
          </button>
        ))}
      </nav>

      <div className="mt-6">
        {tab === 'Manage Classes' && <ClassManager initialClasses={initialClasses} />}
        {tab === 'Take Attendance' && <AttendanceScheduler occurrences={occurrences} />}
        {tab === 'Membership Packages' && <PackageManager initialPackages={initialPackages} />}
      </div>
    </div>
  );
}
