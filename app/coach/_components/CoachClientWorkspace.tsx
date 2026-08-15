'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { Avatar } from '@/app/_components/Avatar';
import { Logo } from '@/app/_components/Logo';
import { CoachNav } from './CoachNav';
import { CoachBottomTabBar } from './CoachBottomTabBar';
import { CoachBrand } from './CoachBrand';
import { CoachHeaderExtras } from './CoachHeaderExtras';
import { WorkspaceTabBar } from './workspace/WorkspaceTabBar';
import type { WorkspaceTab } from './workspace/tabs';
import { InfoTab } from './workspace/InfoTab';
import { ScheduleTab } from './workspace/ScheduleTab';
import { ItemsTab } from './workspace/ItemsTab';
import { ActivityTab } from './workspace/ActivityTab';
import { ToolsTab } from './workspace/ToolsTab';
import { NotesTab } from './workspace/NotesTab';
import { resolveActiveProgram } from '@/lib/utils/checkin';
import { toIsoDate } from '@/lib/utils/dates';
import type { ClientHealthBucket, ClientHealthStatus } from '@/lib/data/coach';
import type {
  ActivityEventRow,
  BookingRow,
  ClientExerciseMaxRow,
  ClientJournalEntryRow,
  ClientProfileRow,
  EducationCourseAssignmentWithDetails,
  ExerciseLibraryRow,
  FormAssignmentWithDetails,
  HabitWithLogs,
  WorkoutProgramRow,
} from '@/lib/data/types';

// Soft-pill status badge for this header specifically -- distinct from the plain colored text
// ClientTable.tsx uses in its dense rows, and from StatusBadge's fuller "Action required"
// phrasing used in Program Health; this context wants just the bucket color/name, emphasized.
const STATUS_PILL: Record<ClientHealthBucket, { label: string; cls: string }> = {
  red: { label: 'Red', cls: 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' },
  amber: { label: 'Amber', cls: 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400' },
  green: { label: 'Green', cls: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400' },
  unmonitored: { label: 'Unmonitored', cls: 'bg-zinc-100 text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400' },
};

// Coach-only per-client workspace -- the row-click destination from the Clients table. Info,
// Schedule, Items, Tools, Notes and Activity all have real content; deep editing (Setup
// fields, the workout builder itself, etc.) stays behind "Open full dashboard" rather than
// being rebuilt here a second time.
export function CoachClientWorkspace({
  clientId,
  clientLabel,
  clientEmail,
  healthStatus,
  coachUnreadCount,
  coachEmail,
  profile,
  journalEntries,
  bookings,
  programs,
  formAssignments,
  educationAssignments,
  habits,
  activity,
  disabledScreens,
  clientExerciseMaxes,
  exerciseLibrary,
}: {
  clientId: string;
  clientLabel: string;
  clientEmail: string;
  healthStatus: ClientHealthStatus | null;
  coachUnreadCount: number;
  coachEmail: string;
  profile: ClientProfileRow | null;
  journalEntries: ClientJournalEntryRow[];
  bookings: BookingRow[];
  programs: WorkoutProgramRow[];
  formAssignments: FormAssignmentWithDetails[];
  educationAssignments: EducationCourseAssignmentWithDetails[];
  habits: HabitWithLogs[];
  activity: ActivityEventRow[];
  disabledScreens: string[];
  clientExerciseMaxes: ClientExerciseMaxRow[];
  exerciseLibrary: ExerciseLibraryRow[];
}) {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('Info');

  const activeProgram = useMemo(() => resolveActiveProgram(programs, toIsoDate(new Date())), [programs]);
  const maxWeek = activeProgram
    ? Math.max(0, ...activeProgram.program.workout_program_days.map((d) => d.week_num))
    : 0;

  return (
    <AppShell
      title={<CoachBrand />}
      isCoachView
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={coachUnreadCount} email={coachEmail} />}
      mobileHeader={<Logo size={28} />}
    >
      <Link
        href="/coach/clients"
        className="flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300"
      >
        &larr; All clients
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={clientLabel} size="lg" />
          <div className="min-w-0">
            <p className="text-lg font-bold text-black dark:text-zinc-50">{clientLabel}</p>
            <p className="truncate text-sm text-zinc-500">
              {clientEmail}
              {activeProgram && ` · ${activeProgram.program.name} · Week ${activeProgram.weekNum} of ${maxWeek}`}
            </p>
          </div>
        </div>
        {healthStatus && (
          <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${STATUS_PILL[healthStatus.status].cls}`}>
            {STATUS_PILL[healthStatus.status].label}
          </span>
        )}
      </div>

      {profile?.deletion_requested_at && (
        <div className="mt-3 flex items-center gap-2 rounded-lg border border-danger/20 bg-danger/10 px-3 py-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          This client has requested their account be deleted.
        </div>
      )}

      <div className="mt-4">
        <WorkspaceTabBar active={activeTab} onSelect={setActiveTab} />
        {activeTab === 'Info' && <InfoTab profile={profile} />}
        {activeTab === 'Schedule' && <ScheduleTab bookings={bookings} programs={programs} />}
        {activeTab === 'Items' && (
          <ItemsTab
            programs={programs}
            formAssignments={formAssignments}
            educationAssignments={educationAssignments}
            habits={habits}
          />
        )}
        {activeTab === 'Tools' && (
          <ToolsTab
            clientId={clientId}
            disabledScreens={disabledScreens}
            clientExerciseMaxes={clientExerciseMaxes}
            exerciseLibrary={exerciseLibrary}
          />
        )}
        {activeTab === 'Notes' && <NotesTab clientId={clientId} entries={journalEntries} profile={profile} />}
        {activeTab === 'Activity' && <ActivityTab events={activity} />}
      </div>

      <Link
        href={`/coach/clients/${clientId}/full`}
        className="mt-6 inline-block text-sm font-medium text-accent hover:underline"
      >
        Open full dashboard &rarr;
      </Link>
    </AppShell>
  );
}
