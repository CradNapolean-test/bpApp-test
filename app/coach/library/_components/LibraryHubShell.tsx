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
import { ExerciseLibraryManager } from './ExerciseLibraryManager';
import { ProgramTemplateManager } from './ProgramTemplateManager';
import { EducationPane } from './EducationPane';
import { FormsPane } from './FormsPane';
import type {
  ClientGroupWithMembers,
  EducationCourseWithModules,
  ExerciseLibraryRow,
  FormTemplateRow,
  ProgramTemplateWithDays,
} from '@/lib/data/types';

const TABS = ['Exercises', 'Program templates', 'Education', 'Forms'] as const;
type Tab = (typeof TABS)[number];

const TAB_PARAM: Record<string, Tab> = {
  exercises: 'Exercises',
  templates: 'Program templates',
  education: 'Education',
  forms: 'Forms',
};

export function LibraryHubShell({
  initialExercises,
  initialTemplates,
  initialFormTemplates,
  initialCourses,
  unreadCount,
  groups,
  email,
}: {
  initialExercises: ExerciseLibraryRow[];
  initialTemplates: ProgramTemplateWithDays[];
  initialFormTemplates: FormTemplateRow[];
  initialCourses: EducationCourseWithModules[];
  unreadCount: number;
  groups: ClientGroupWithMembers[];
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Exercises');

  return (
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      mobileHeader={<Logo size={28} />}
    >
      <h1 className="mb-4 text-2xl font-bold text-black dark:text-zinc-50">Library</h1>
      <HubTabBar tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'Exercises' && <ExerciseLibraryManager initialExercises={initialExercises} />}
      {tab === 'Program templates' && (
        <ProgramTemplateManager initialTemplates={initialTemplates} library={initialExercises} groups={groups} />
      )}
      {tab === 'Education' && <EducationPane initialCourses={initialCourses} />}
      {tab === 'Forms' && <FormsPane initialTemplates={initialFormTemplates} />}
    </AppShell>
  );
}
