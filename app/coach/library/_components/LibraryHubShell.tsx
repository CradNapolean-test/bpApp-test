'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachMessagesButton } from '@/app/coach/_components/CoachMessagesButton';
import { ExerciseLibraryManager } from './ExerciseLibraryManager';
import { ProgramTemplateManager } from './ProgramTemplateManager';
import { FormsPane } from './FormsPane';
import { EducationPane } from './EducationPane';
import type {
  ClientGroupWithMembers,
  EducationCourseWithModules,
  ExerciseLibraryRow,
  FormTemplateRow,
  ProgramTemplateWithDays,
} from '@/lib/data/types';

const TABS = ['Exercises', 'Programme Templates', 'Forms', 'Education'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  exercises: 'Exercises',
  templates: 'Programme Templates',
  forms: 'Forms',
  education: 'Education',
};

export function LibraryHubShell({
  initialExercises,
  initialTemplates,
  initialFormTemplates,
  initialCourses,
  unreadCount,
  groups,
}: {
  initialExercises: ExerciseLibraryRow[];
  initialTemplates: ProgramTemplateWithDays[];
  initialFormTemplates: FormTemplateRow[];
  initialCourses: EducationCourseWithModules[];
  unreadCount: number;
  groups: ClientGroupWithMembers[];
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Exercises');

  return (
    <AppShell
      title="Library"
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachMessagesButton unreadCount={unreadCount} />}
    >
      <div className="relative mb-4 w-full sm:w-64">
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as Tab)}
          className="w-full appearance-none rounded-lg border-2 border-accent/40 bg-accent-soft px-3 py-2.5 pr-9 text-sm font-medium text-black dark:text-zinc-50"
        >
          {TABS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-accent" />
      </div>

      {tab === 'Exercises' && <ExerciseLibraryManager initialExercises={initialExercises} />}
      {tab === 'Programme Templates' && (
        <ProgramTemplateManager initialTemplates={initialTemplates} library={initialExercises} groups={groups} />
      )}
      {tab === 'Forms' && <FormsPane initialTemplates={initialFormTemplates} />}
      {tab === 'Education' && <EducationPane initialCourses={initialCourses} />}
    </AppShell>
  );
}
