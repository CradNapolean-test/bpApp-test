'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useStaggerIn } from '@/app/_components/motion/useStaggerIn';
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
import { Skeleton } from '@/app/_components/Skeleton';
import { Button } from '@/app/_components/Button';
import { loadLibraryTab } from '@/lib/data/libraryTabActions';
import type { LibraryTabData } from '@/lib/data/libraryTabs';
import { tabSource, type CachedTab, type LibrarySummary, type LibraryTabSlug } from '@/lib/libraryTabs';
import { getDataVersion, getServerDataVersion, subscribeDataVersion } from '@/lib/refreshSignal';

type Tab = 'Exercises' | 'Program templates' | 'Education' | 'Forms' | 'Foods';

// What each tab is called in the address (?tab=...), so a reload or a shared link opens the same tab.
const TAB_SLUG: Record<Tab, LibraryTabSlug> = { Exercises: 'exercises', 'Program templates': 'templates', Education: 'education', Forms: 'forms', Foods: 'foods' };

const TAB_NAME: Record<LibraryTabSlug, Tab> = {
  exercises: 'Exercises',
  templates: 'Program templates',
  education: 'Education',
  forms: 'Forms',
  foods: 'Foods',
};

// The page loads the tiles' counts and the tab that opens; each other tab is fetched the first time it is opened (LB25), kept while the
// coach moves between tabs, and read again after a save (lib/refreshSignal.ts), as the page's own tab is redrawn by the save's refresh.
export function LibraryHubShell({
  initialTab,
  summary,
  unreadCount,
  email,
}: {
  initialTab: LibraryTabData;
  summary: LibrarySummary;
  unreadCount: number;
  email: string;
}) {
  const [tab, setTabState] = useState<Tab>(TAB_NAME[initialTab.tab]);
  const paneRef = useRef<HTMLDivElement>(null);
  const setTab = (next: Tab) => {
    setTabState(next);
    writeTabToUrl(TAB_SLUG[next]);
  };

  const version = useSyncExternalStore(subscribeDataVersion, getDataVersion, getServerDataVersion);
  const [cache, setCache] = useState<Partial<Record<LibraryTabSlug, CachedTab<LibraryTabData>>>>({});
  const [failed, setFailed] = useState<{ slug: LibraryTabSlug; version: number } | null>(null);
  const [retries, setRetries] = useState(0);
  const slug = TAB_SLUG[tab];
  const source = tabSource(slug, { tab: initialTab.tab, data: initialTab }, cache, version);
  const mustFetch = source.fetch && !(failed?.slug === slug && failed.version === version);

  useEffect(() => {
    if (!mustFetch) return;
    let live = true;
    const readAt = version;
    loadLibraryTab(slug)
      .then((res) => {
        if (!live) return;
        // Only the tab asked for is ever kept, under its own name.
        if (res.ok && res.data.tab === slug) setCache((c) => ({ ...c, [slug]: { data: res.data, version: readAt } }));
        else setFailed({ slug, version: readAt });
      })
      .catch(() => {
        if (live) setFailed({ slug, version: readAt });
      });
    return () => {
      live = false;
    };
  }, [mustFetch, slug, version, retries]);

  const data = source.data;
  const showError = !data && failed?.slug === slug;
  // The rows settle in when the tab's data is there, which for a tab fetched on opening is a moment after the tab is chosen.
  useStaggerIn(paneRef, '[data-stagger]', `${tab}:${data ? 'ready' : 'loading'}`);

  // The tiles' figures: exercises still to film, and programme rollouts not applied yet.
  const noVideo = summary.exercisesWithoutVideo;
  const rollingOut = summary.rollingOut;

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
              value: summary.exercises,
              sub: noVideo > 0 ? `${noVideo} without a video` : 'All have a video',
              warn: noVideo > 0,
            },
            { tab: 'Program templates', label: 'Templates', value: summary.templates, sub: rollingOut > 0 ? `${rollingOut} rolling out` : 'None rolling out' },
            { tab: 'Education', label: 'Education', value: summary.courses, sub: summary.courses === 1 ? 'course' : 'courses' },
            { tab: 'Forms', label: 'Forms', value: summary.forms, sub: summary.forms === 1 ? 'form' : 'forms' },
            { tab: 'Foods', label: 'Foods', sub: 'The food list members log from' },
          ]}
        />
      </div>

      {/* Each section's rows settle in one after another when it opens (GSAP). */}
      <div ref={paneRef}>
      {showError ? (
        <div role="alert" className="rounded-2xl border border-black/[.08] bg-card p-5 text-sm dark:border-white/10">
          <p className="font-semibold text-black dark:text-zinc-50">This tab couldn’t be loaded.</p>
          <Button className="mt-3" onClick={() => { setFailed(null); setRetries((n) => n + 1); }}>
            Try again
          </Button>
        </div>
      ) : !data ? (
        <div aria-busy="true" aria-label={`Loading ${tab}`} className="space-y-3">
          <Skeleton className="h-11 w-full rounded-xl" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      ) : (
        <LibraryPane data={data} />
      )}
      </div>
    </AppShell>
    </ClientOnly>
  );
}

// The pane for one tab's data. Each pane is given only its own tab's data.
function LibraryPane({ data }: { data: LibraryTabData }) {
  switch (data.tab) {
    case 'exercises':
      return <ExerciseLibraryManager initialExercises={data.exercises} usage={data.usage} />;
    case 'templates':
      return <ProgramTemplateManager initialTemplates={data.templates} library={data.exercises} groups={data.groups} members={data.members} rollouts={data.rollouts} />;
    case 'education':
      return (
        <EducationPane
          initialCourses={data.courses}
          members={data.members}
          groups={data.groups}
          rollup={data.rollup}
          otherGyms={data.otherGyms}
          memberNames={data.memberNames}
        />
      );
    case 'forms':
      return (
        <FormsPane
          initialTemplates={data.formTemplates}
          groups={data.groups}
          rollup={data.rollup}
          members={data.members}
          memberNames={data.memberNames}
          newTypesReady={data.newTypesReady}
        />
      );
    case 'foods':
      return <FoodsPane />;
  }
}
