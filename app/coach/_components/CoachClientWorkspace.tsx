'use client';

import { useState } from 'react';
import Link from 'next/link';
import { AppShell } from '@/app/_components/AppShell';
import { StatusBadge } from '@/app/_components/StatusBadge';
import { EmptyState } from '@/app/_components/EmptyState';
import { CoachNav } from './CoachNav';
import { CoachBottomTabBar } from './CoachBottomTabBar';
import { CoachMessagesButton } from './CoachMessagesButton';
import { WorkspaceTabBar } from './workspace/WorkspaceTabBar';
import { WORKSPACE_TAB_ICON } from './workspace/tabs';
import type { WorkspaceTab } from './workspace/tabs';
import { InfoTab } from './workspace/InfoTab';
import { ScheduleTab } from './workspace/ScheduleTab';
import { ItemsTab } from './workspace/ItemsTab';
import { ActivityTab } from './workspace/ActivityTab';
import { ToolsTab } from './workspace/ToolsTab';
import type { ClientHealthStatus } from '@/lib/data/coach';
import type {
  ActivityEventRow,
  BookingRow,
  ClientJournalEntryRow,
  EducationCourseAssignmentWithDetails,
  FormAssignmentWithDetails,
  HabitWithLogs,
  WorkoutProgramRow,
} from '@/lib/data/types';

// Coach-only per-client workspace -- replaces the old pattern of a coach viewing the client's
// own DashboardShell read-only. Phase 1-3 of docs/PT_DISTINCTION_LAYOUT_ROADMAP.md: Info,
// Schedule, Items and Activity have real content; Tools/Communications share a placeholder
// until their own phases land.
export function CoachClientWorkspace({
  clientId,
  clientLabel,
  healthStatus,
  coachUnreadCount,
  journalEntries,
  bookings,
  programs,
  formAssignments,
  educationAssignments,
  habits,
  activity,
  disabledScreens,
}: {
  clientId: string;
  clientLabel: string;
  healthStatus: ClientHealthStatus | null;
  coachUnreadCount: number;
  journalEntries: ClientJournalEntryRow[];
  bookings: BookingRow[];
  programs: WorkoutProgramRow[];
  formAssignments: FormAssignmentWithDetails[];
  educationAssignments: EducationCourseAssignmentWithDetails[];
  habits: HabitWithLogs[];
  activity: ActivityEventRow[];
  disabledScreens: string[];
}) {
  // Defaults to 'Activity', matching PT Distinction's own landing tab, now that Phase 3 gives
  // it real content.
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Activity');

  const coachSummary = (
    <div className="mt-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-black/10 bg-accent-soft px-3 py-2 dark:border-white/10">
      <Link
        href="/coach"
        className="flex items-center gap-1 text-sm font-medium text-zinc-600 hover:text-black dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        &larr; All clients
      </Link>
      {healthStatus && (
        <span className="flex items-center gap-2 text-sm text-zinc-600 dark:text-zinc-400">
          <StatusBadge status={healthStatus.status} />
          {healthStatus.status !== 'unmonitored' && `last active ${healthStatus.daysSinceActive}d ago`}
        </span>
      )}
    </div>
  );

  return (
    <AppShell
      title={clientLabel}
      isCoachView
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachMessagesButton unreadCount={coachUnreadCount} />}
      coachSummary={coachSummary}
    >
      <WorkspaceTabBar active={activeTab} onSelect={setActiveTab} />
      {activeTab === 'Info' && <InfoTab clientId={clientId} entries={journalEntries} />}
      {activeTab === 'Schedule' && <ScheduleTab bookings={bookings} programs={programs} />}
      {activeTab === 'Items' && (
        <ItemsTab
          programs={programs}
          formAssignments={formAssignments}
          educationAssignments={educationAssignments}
          habits={habits}
        />
      )}
      {activeTab === 'Activity' && <ActivityTab events={activity} />}
      {activeTab === 'Tools' && <ToolsTab clientId={clientId} disabledScreens={disabledScreens} />}
      {activeTab === 'Communications' && (
        <EmptyState
          icon={WORKSPACE_TAB_ICON[activeTab]}
          title="Coming in a future phase"
          hint={`The ${activeTab} tab isn't built yet.`}
        />
      )}
    </AppShell>
  );
}
