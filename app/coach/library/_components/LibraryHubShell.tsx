'use client';

import { useState } from 'react';
import { AppShell } from '@/app/_components/AppShell';
import { CoachNav } from '@/app/coach/_components/CoachNav';
import { ExerciseLibraryManager } from './ExerciseLibraryManager';
import { ProgramTemplateManager } from './ProgramTemplateManager';
import type { ExerciseLibraryRow, ProgramTemplateWithDays } from '@/lib/data/types';

const TABS = ['Exercises', 'Programme Templates'] as const;
type Tab = (typeof TABS)[number];

export function LibraryHubShell({
  initialExercises,
  initialTemplates,
  unreadCount,
}: {
  initialExercises: ExerciseLibraryRow[];
  initialTemplates: ProgramTemplateWithDays[];
  unreadCount: number;
}) {
  const [tab, setTab] = useState<Tab>('Exercises');

  return (
    <AppShell
      title="Library"
      topBar={<CoachNav unreadCount={unreadCount} />}
      sidebar={
        <nav className="space-y-1">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`block w-full rounded-md px-3 py-1.5 text-left text-sm font-medium transition-colors ${
                tab === t
                  ? 'bg-accent text-accent-foreground'
                  : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
              }`}
            >
              {t}
            </button>
          ))}
        </nav>
      }
    >
      {tab === 'Exercises' && <ExerciseLibraryManager initialExercises={initialExercises} />}
      {tab === 'Programme Templates' && (
        <ProgramTemplateManager initialTemplates={initialTemplates} library={initialExercises} />
      )}
    </AppShell>
  );
}
