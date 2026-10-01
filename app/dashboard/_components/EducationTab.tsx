'use client';

import { useState } from 'react';
import { Check, ChevronDown, GraduationCap, Lock, PlayCircle } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { assignCourse, markLessonComplete, markLessonIncomplete } from '@/lib/data/education';
import { courseCompletionPercent, isLessonUnlocked } from '@/lib/utils/educationProgress';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { parseVideoEmbedUrl } from '@/lib/utils/videoEmbed';
import type {
  ClientProfileRow,
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
  open,
  onToggleOpen,
}: {
  lesson: EducationLessonRow;
  clientId: string;
  isCoachView: boolean;
  completed: boolean;
  todayIso: string;
  open: boolean;
  onToggleOpen: () => void;
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
      <div className="flex items-center gap-3 rounded-xl border border-black/5 p-3 text-zinc-400 dark:border-white/5 dark:text-zinc-600">
        <Lock className="h-4 w-4 shrink-0" />
        <div>
          <p className="text-sm font-medium">{lesson.title}</p>
          <p className="text-xs">
            Available from{' '}
            {new Date(lesson.unlock_at + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'UTC' })}
          </p>
        </div>
      </div>
    );
  }

  const embedUrl = lesson.link_url ? parseVideoEmbedUrl(lesson.link_url) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-black/5 dark:border-white/5">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center gap-3 p-3 text-left">
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
            completed ? 'border-accent bg-accent text-accent-foreground' : 'border-black/15 text-transparent dark:border-white/20'
          }`}
        >
          <Check className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-sm font-medium text-black dark:text-zinc-50">{lesson.title}</span>
        {embedUrl && <PlayCircle className="h-4 w-4 shrink-0 text-zinc-400" />}
        <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-black/5 p-3 dark:border-white/5">
          {embedUrl ? (
            <div className="aspect-video w-full overflow-hidden rounded-lg bg-black">
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
              <a href={lesson.link_url} target="_blank" rel="noopener noreferrer" className="inline-block text-sm font-semibold text-accent hover:underline">
                Open link ↗
              </a>
            )
          )}
          {lesson.body && <p className="whitespace-pre-wrap text-sm text-zinc-600 dark:text-zinc-400">{lesson.body}</p>}
          {isCoachView ? (
            <span className={`text-xs font-medium ${completed ? 'text-accent' : 'text-zinc-500'}`}>
              {completed ? 'Completed' : 'Pending'}
            </span>
          ) : (
            <Button type="button" variant={completed ? 'primary' : 'outline'} size="sm" disabled={busy} onClick={handleToggle}>
              <Check className="mr-1 inline h-3.5 w-3.5" />
              {completed ? 'Completed' : 'Mark complete'}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function CourseOverlay({
  assignment,
  clientId,
  isCoachView,
  onClose,
  timezone,
}: {
  assignment: EducationCourseAssignmentWithDetails;
  clientId: string;
  isCoachView: boolean;
  onClose: () => void;
  timezone?: string | null;
}) {
  const todayIso = todayIsoInTz(timezone ?? DEFAULT_TIMEZONE);
  const completedIds = new Set(assignment.completions.map((c) => c.lesson_id));
  const sortedModules = [...assignment.course.education_modules].sort((a, b) => a.sort_order - b.sort_order);
  const [openLessonId, setOpenLessonId] = useState<string | null>(null);
  // Modules start collapsed except the first one that still has something left to do.
  const firstUnfinished = sortedModules.find((m) => m.education_lessons.some((l) => !completedIds.has(l.id)))?.id ?? null;
  const [openModules, setOpenModules] = useState<Set<string>>(() => new Set(firstUnfinished ? [firstUnfinished] : []));
  const pct = courseCompletionPercent(assignment.course, assignment.completions);

  function toggleModule(id: string) {
    setOpenModules((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <FocusOverlay title={assignment.course.title} subtitle={assignment.course.description ?? undefined} onClose={onClose}>
      <div className="space-y-3">
        <div className="rounded-2xl border border-black/[.05] bg-card p-3 dark:border-white/10">
          <div className="flex items-center justify-between text-sm">
            <span className="font-semibold text-black dark:text-zinc-50">Your progress</span>
            <span className="font-bold text-accent">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {sortedModules.map((module) => {
          const sortedLessons = [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);
          const done = sortedLessons.filter((l) => completedIds.has(l.id)).length;
          const isOpen = openModules.has(module.id);
          return (
            <div key={module.id} className="rounded-2xl border border-black/[.05] bg-card dark:border-white/10">
              <button type="button" onClick={() => toggleModule(module.id)} className="flex w-full items-center justify-between gap-2 p-3.5 text-left">
                <div className="min-w-0">
                  <h4 className="font-bold text-black dark:text-zinc-50">{module.title}</h4>
                  <p className="text-xs text-zinc-500">
                    {done} of {sortedLessons.length} lesson{sortedLessons.length === 1 ? '' : 's'} done
                  </p>
                </div>
                <ChevronDown className={`h-4 w-4 shrink-0 text-zinc-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-2 px-3 pb-3">
                  {sortedLessons.map((lesson) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      clientId={clientId}
                      isCoachView={isCoachView}
                      completed={completedIds.has(lesson.id)}
                      todayIso={todayIso}
                      open={openLessonId === lesson.id}
                      onToggleOpen={() => setOpenLessonId(openLessonId === lesson.id ? null : lesson.id)}
                    />
                  ))}
                  {sortedLessons.length === 0 && <p className="text-sm text-zinc-500">No lessons in this module yet.</p>}
                </div>
              )}
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
  readOnly = false,
  profile,
}: {
  clientId: string;
  isCoachView: boolean;
  courses: EducationCourseWithModules[];
  assignments: EducationCourseAssignmentWithDetails[];
  // Narrower than isCoachView -- see FormsTab's identical prop for why this can't just be
  // isCoachView=false for a read-only cross-coach view.
  readOnly?: boolean;
  profile?: ClientProfileRow | null;
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
      {isCoachView && !readOnly && (
        <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
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
              className="shrink-0 rounded-full bg-accent px-5 py-2.5 text-sm font-bold text-accent-foreground disabled:opacity-50"
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
                  className="w-full rounded-2xl border border-black/[.05] bg-card p-4 text-left dark:border-white/10"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-bold text-black dark:text-zinc-50">{a.course.title}</p>
                    <span className="text-sm font-bold text-accent">{pct}%</span>
                  </div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-black/5 dark:bg-white/10">
                    <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mt-1.5 text-xs text-zinc-500">
                    {a.completions.length === 0 ? 'Not started' : pct >= 100 ? 'Completed' : 'In progress'} ·{' '}
                    {a.course.education_modules.length} section{a.course.education_modules.length === 1 ? '' : 's'}
                  </p>
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
          timezone={profile?.timezone}
        />
      )}
    </div>
  );
}
