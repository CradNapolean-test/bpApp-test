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
import { ExerciseLibraryManager } from './ExerciseLibraryManager';
import { ProgramTemplateManager } from './ProgramTemplateManager';
import { EducationPane } from './EducationPane';
import { FoodsPane } from './FoodsPane';
import { FormsPane } from './FormsPane';
import type {
  ClientGroupWithMembers,
  EducationCourseWithModules,
  ExerciseLibraryRow,
  FormTemplateRow,
  ProgramTemplateWithDays,
  ProgrammeRolloutRow,
  CourseRollupRow,
} from '@/lib/data/types';

const TABS = ['Exercises', 'Program templates', 'Education', 'Forms', 'Foods'] as const;
type Tab = (typeof TABS)[number];

// What each tab is called in the address (?tab=...), so a reload or a shared link opens the same tab.
const TAB_SLUG: Record<Tab, string> = { Exercises: 'exercises', 'Program templates': 'templates', Education: 'education', Forms: 'forms', Foods: 'foods' };

const TAB_PARAM: Record<string, Tab> = {
  exercises: 'Exercises',
  templates: 'Program templates',
  education: 'Education',
  forms: 'Forms',
  foods: 'Foods',
};

export function LibraryHubShell({
  initialExercises,
  initialTemplates,
  initialFormTemplates,
  initialCourses,
  unreadCount,
  groups,
  members,
  rollouts,
  exerciseUsage,
  courseRollup,
  otherGyms,
  email,
}: {
  initialExercises: ExerciseLibraryRow[];
  initialTemplates: ProgramTemplateWithDays[];
  initialFormTemplates: FormTemplateRow[];
  initialCourses: EducationCourseWithModules[];
  unreadCount: number;
  groups: ClientGroupWithMembers[];
  members: { id: string; name: string }[];
  rollouts: ProgrammeRolloutRow[];
  exerciseUsage: Record<string, number>;
  courseRollup: CourseRollupRow[];
  otherGyms: { id: string; name: string }[];
  email: string;
}) {
  const searchParams = useSearchParams();
  const [tab, setTabState] = useState<Tab>(() => TAB_PARAM[searchParams.get('tab') ?? ''] ?? 'Exercises');
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
        Library
        <ActiveGymTag />
      </h1>
      <HubTabBar label="Library sections" tabs={TABS} active={tab} onSelect={setTab} />

      {tab === 'Exercises' && <ExerciseLibraryManager initialExercises={initialExercises} usage={exerciseUsage} />}
      {tab === 'Program templates' && (
        <ProgramTemplateManager initialTemplates={initialTemplates} library={initialExercises} groups={groups} members={members} rollouts={rollouts} />
      )}
      {tab === 'Education' && <EducationPane initialCourses={initialCourses} members={members} groups={groups} rollup={courseRollup} otherGyms={otherGyms} />}
      {tab === 'Forms' && <FormsPane initialTemplates={initialFormTemplates} />}
      {tab === 'Foods' && <FoodsPane />}
    </AppShell>
    </ClientOnly>
  );
}
