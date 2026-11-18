'use client';

import { useRef, useState } from 'react';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
import { useSearchParams } from 'next/navigation';
import { AppShell } from '@/app/_components/AppShell';
import { ClientOnly } from '@/app/_components/ClientOnly';
import { PageSkeleton } from '@/app/_components/PageSkeleton';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { CoachSidebar } from '@/app/coach/_components/CoachSidebar';
import { CoachPageHeader } from '@/app/coach/_components/CoachUi';
import { CoachBottomTabBar } from '@/app/coach/_components/CoachBottomTabBar';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachMobileBrand } from '@/app/coach/_components/CoachMobileBrand';
import { CoachHeaderExtras } from '@/app/coach/_components/CoachHeaderExtras';
import { LibraryTiles } from './LibraryTiles';
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


type Tab = 'Exercises' | 'Program templates' | 'Education' | 'Forms' | 'Foods';

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
  const paneRef = useRef<HTMLDivElement>(null);
  useStaggerIn(paneRef, '[data-stagger]', tab);
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(TAB_SLUG[next]);
  };

  // The tiles' figures: exercises still to film, and programme rollouts not applied yet.
  const noVideo = initialExercises.filter((e) => !e.video_url?.startsWith('https://')).length;
  const rollingOut = rollouts.filter((r) => !r.applied_at).length;

  return (
    <ClientOnly fallback={<PageSkeleton />}>
    <AppShell
      title={<CoachBrand />}
      topBar={<CoachNav />}
      bottomBar={<CoachBottomTabBar />}
      headerAction={<CoachHeaderExtras unreadCount={unreadCount} email={email} />}
      coachSidebar={<CoachSidebar unreadCount={unreadCount} email={email} />}
      mobileHeader={<CoachMobileBrand />}
    >
      <CoachPageHeader
        eyebrow="What you build workouts, courses and forms from"
        title={
          <>
            Library
            <ActiveGymTag />
          </>
        }
      />
      <div className="mb-6 mt-6">
        <LibraryTiles
          active={tab}
          onSelect={setTab}
          tiles={[
            {
              tab: 'Exercises',
              label: 'Exercises',
              value: initialExercises.length,
              sub: noVideo > 0 ? `${noVideo} without a video` : 'All have a video',
              warn: noVideo > 0,
            },
            { tab: 'Program templates', label: 'Templates', value: initialTemplates.length, sub: rollingOut > 0 ? `${rollingOut} rolling out` : 'None rolling out' },
            { tab: 'Education', label: 'Education', value: initialCourses.length, sub: initialCourses.length === 1 ? 'course' : 'courses' },
            { tab: 'Forms', label: 'Forms', value: initialFormTemplates.length, sub: initialFormTemplates.length === 1 ? 'form' : 'forms' },
            { tab: 'Foods', label: 'Foods', sub: 'The food list members log from' },
          ]}
        />
      </div>

      {/* Each section's rows settle in one after another when it opens (GSAP). */}
      <div ref={paneRef}>
      {tab === 'Exercises' && <ExerciseLibraryManager initialExercises={initialExercises} usage={exerciseUsage} />}
      {tab === 'Program templates' && (
        <ProgramTemplateManager initialTemplates={initialTemplates} library={initialExercises} groups={groups} members={members} rollouts={rollouts} />
      )}
      {tab === 'Education' && <EducationPane initialCourses={initialCourses} members={members} groups={groups} rollup={courseRollup} otherGyms={otherGyms} />}
      {tab === 'Forms' && <FormsPane initialTemplates={initialFormTemplates} />}
      {tab === 'Foods' && <FoodsPane />}
      </div>
    </AppShell>
    </ClientOnly>
  );
}
