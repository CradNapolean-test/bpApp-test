'use client';

import { useState } from 'react';
import { Check, GraduationCap } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { assignCourse, markLessonComplete, markLessonIncomplete } from '@/lib/data/education';
import { courseCompletionPercent, isLessonUnlocked } from '@/lib/utils/educationProgress';
import { toIsoDate } from '@/lib/utils/dates';
import { parseVideoEmbedUrl } from '@/lib/utils/videoEmbed';
import type {
  EducationCourseAssignmentWithDetails,
  EducationCourseWithModules,
  EducationLessonRow,
} from '@/lib/data/types';

function LessonItem({
  lesson,
  clientId,
  isCoachView,
  completed,
  todayIso,
}: {
  lesson: EducationLessonRow;
  clientId: string;
  isCoachView: boolean;
  completed: boolean;
  todayIso: string;
}) {
  const { run, busy } = useAction();
  const unlocked = isLessonUnlocked(lesson, todayIso);

  async function handleToggle() {
    if (completed) {
      await run(() => markLessonIncomplete(lesson.id, clientId));
    } else {
      await run(() => markLessonComplete(lesson.id, clientId));
    }
  }

  if (!unlocked) {
    return (
      <div className="rounded-md border border-black/5 p-3 text-sm text-zinc-400 dark:border-white/5 dark:text-zinc-600">
        <p className="font-medium">{lesson.title}</p>
        <p className="text-xs">Available from {lesson.unlock_at}</p>
      </div>
    );
  }

  const embedUrl = lesson.link_url ? parseVideoEmbedUrl(lesson.link_url) : null;

  return (
    <div className="space-y-1.5 rounded-md border border-black/5 p-3 dark:border-white/5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">{lesson.title}</p>
        {isCoachView ? (
          <span className={`text-xs font-medium ${completed ? 'text-accent' : 'text-zinc-500'}`}>
            {completed ? 'Completed' : 'Pending'}
          </span>
        ) : (
          <Button
            type="button"
            variant={completed ? 'primary' : 'outline'}
            size="sm"
            disabled={busy}
            onClick={handleToggle}
          >
            <Check className="mr-1 inline h-3.5 w-3.5" />
            {completed ? 'Completed' : 'Mark complete'}
          </Button>
        )}
      </div>
      {lesson.body && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{lesson.body}</p>}
      {embedUrl ? (
        <div className="aspect-video w-full overflow-hidden rounded-md">
          <iframe
            src={embedUrl}
            title={lesson.title}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
            className="h-full w-full"
          />
        </div>
      ) : (
        lesson.link_url && (
          <a href={lesson.link_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-accent hover:underline">
            Open link ↗
          </a>
        )
      )}
    </div>
  );
}

function CourseOverlay({
  assignment,
  clientId,
  isCoachView,
  onClose,
}: {
  assignment: EducationCourseAssignmentWithDetails;
  clientId: string;
  isCoachView: boolean;
  onClose: () => void;
}) {
  const todayIso = toIsoDate(new Date());
  const completedIds = new Set(assignment.completions.map((c) => c.lesson_id));
  const sortedModules = [...assignment.course.education_modules].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <FocusOverlay title={assignment.course.title} subtitle={assignment.course.description ?? undefined} onClose={onClose}>
      <div className="space-y-4">
        {sortedModules.map((module) => {
          const sortedLessons = [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);
          return (
            <div key={module.id} className="space-y-2 rounded-2xl border border-black/[.05] p-3 dark:border-white/10">
              <div className="flex items-center justify-between gap-2">
                <h4 className="font-bold text-black dark:text-zinc-50">{module.title}</h4>
                <span className="shrink-0 text-sm text-zinc-500">
                  {sortedLessons.length} lesson{sortedLessons.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="space-y-2">
                {sortedLessons.map((lesson) => (
                  <LessonItem
                    key={lesson.id}
                    lesson={lesson}
                    clientId={clientId}
                    isCoachView={isCoachView}
                    completed={completedIds.has(lesson.id)}
                    todayIso={todayIso}
                  />
                ))}
                {sortedLessons.length === 0 && <p className="text-sm text-zinc-500">No lessons in this module yet.</p>}
              </div>
            </div>
          );
        })}
        {sortedModules.length === 0 && <p className="text-sm text-zinc-500">No modules in this course yet.</p>}
      </div>
    </FocusOverlay>
  );
}

export function EducationTab({
  clientId,
  isCoachView,
  courses,
  assignments,
}: {
  clientId: string;
  isCoachView: boolean;
  courses: EducationCourseWithModules[];
  assignments: EducationCourseAssignmentWithDetails[];
}) {
  const { run, busy: assigning } = useAction();
  const [selectedCourse, setSelectedCourse] = useState('');
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCourse) return;
    await run(() => assignCourse(selectedCourse, clientId), {
      success: 'Assigned',
      onDone: () => setSelectedCourse(''),
    });
  }

  const openAssignment = openAssignmentId ? assignments.find((a) => a.id === openAssignmentId) : undefined;

  return (
    <div className="space-y-6">
      {isCoachView && (
        <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <h3 className="font-bold text-black dark:text-zinc-50">Assign a course</h3>
          <form onSubmit={handleAssign} className="mt-2 flex items-center gap-2">
            <select
              className="w-full min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
              value={selectedCourse}
              onChange={(e) => setSelectedCourse(e.target.value)}
            >
              <option value="">Select…</option>
              {courses.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={assigning || !selectedCourse}
              className="shrink-0 rounded-full bg-[#141414] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </button>
          </form>
        </div>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nothing assigned yet"
          hint={isCoachView ? 'Assign a course above, or build one under Education.' : "Your coach hasn't assigned any courses yet."}
        />
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const pct = courseCompletionPercent(a.course, a.completions);
            return (
              <li key={a.id}>
                <button
                  onClick={() => setOpenAssignmentId(a.id)}
                  className="w-full rounded-2xl border border-black/[.05] p-4 text-left dark:border-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-black dark:text-zinc-50">{a.course.title}</p>
                    <span className="text-sm font-bold text-accent">{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {openAssignment && (
        <CourseOverlay
          assignment={openAssignment}
          clientId={clientId}
          isCoachView={isCoachView}
          onClose={() => setOpenAssignmentId(null)}
        />
      )}
    </div>
  );
}
