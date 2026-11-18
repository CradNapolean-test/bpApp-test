'use client';

import { useRef, useState } from 'react';
import { Check, ChevronDown, ChevronRight, GraduationCap, Lock, PlayCircle } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { EmptyState } from '@/app/_components/EmptyState';
import { useOnDemand } from '@/app/_components/useOnDemand';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { assignCourse, getEducationForClient, markLessonComplete, markLessonIncomplete } from '@/lib/data/education';
import { courseCompletionPercent, isLessonUnlocked } from '@/lib/utils/educationProgress';
import { DEFAULT_TIMEZONE, todayIsoInTz } from '@/lib/utils/dates';
import { parseVideoEmbedUrl } from '@/lib/utils/videoEmbed';
import { isHttpsLink } from '@/lib/imageHosts';
import type { ClientProfileRow, EducationCourseAssignmentWithDetails, EducationLessonRow } from '@/lib/data/types';
import { useGrowIn } from '@/app/_components/motion/useGrowIn';

const cardCls = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
const headCls = 'text-base font-extrabold text-black dark:text-zinc-50';

// A course's lessons in the order they are taught (module by module), with how many are done.
function courseLessons(assignment: EducationCourseAssignmentWithDetails) {
  const done = new Set(assignment.completions.map((c) => c.lesson_id));
  const lessons = [...assignment.course.education_modules]
    .sort((a, b) => a.sort_order - b.sort_order)
    .flatMap((m) => [...m.education_lessons].sort((a, b) => a.sort_order - b.sort_order));
  return { lessons, done, doneCount: lessons.filter((l) => done.has(l.id)).length };
}

// "Carry on": the next open lesson in the course already under way (or the first not finished).
function nextLesson(assignments: EducationCourseAssignmentWithDetails[], todayIso: string) {
  const ordered = [
    ...assignments.filter((a) => a.completions.length > 0),
    ...assignments.filter((a) => a.completions.length === 0),
  ];
  for (const a of ordered) {
    const { lessons, done } = courseLessons(a);
    const index = lessons.findIndex((l) => !done.has(l.id) && isLessonUnlocked(l, todayIso));
    if (index >= 0) return { assignment: a, lesson: lessons[index], number: index + 1, total: lessons.length };
  }
  return null;
}

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
            lesson.link_url &&
            isHttpsLink(lesson.link_url) && (
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
  startLessonId = null,
}: {
  assignment: EducationCourseAssignmentWithDetails;
  clientId: string;
  isCoachView: boolean;
  onClose: () => void;
  timezone?: string | null;
  startLessonId?: string | null;
}) {
  const todayIso = todayIsoInTz(timezone ?? DEFAULT_TIMEZONE);
  const completedIds = new Set(assignment.completions.map((c) => c.lesson_id));
  const sortedModules = [...assignment.course.education_modules].sort((a, b) => a.sort_order - b.sort_order);
  const [openLessonId, setOpenLessonId] = useState<string | null>(startLessonId);
  // Modules start collapsed except the first one that still has something left to do (or the one holding the lesson it opened on).
  const startModule = startLessonId ? sortedModules.find((m) => m.education_lessons.some((l) => l.id === startLessonId))?.id : undefined;
  const firstUnfinished = startModule ?? sortedModules.find((m) => m.education_lessons.some((l) => !completedIds.has(l.id)))?.id ?? null;
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
    <FocusOverlay title={assignment.course.title} subtitle={assignment.course.description ?? undefined} onClose={onClose} variant={isCoachView ? 'plain' : 'member'}>
      <div className="space-y-3">
        <div className={`${cardCls} p-4`}>
          <div className="flex items-center justify-between text-sm">
            <span className="font-bold text-black dark:text-zinc-50">Your progress</span>
            <span className="font-bold text-accent">{pct}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-black/10 dark:bg-white/15">
            <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
          </div>
        </div>
        {sortedModules.map((module) => {
          const sortedLessons = [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);
          const done = sortedLessons.filter((l) => completedIds.has(l.id)).length;
          const isOpen = openModules.has(module.id);
          return (
            <div key={module.id} className={cardCls}>
              <button type="button" onClick={() => toggleModule(module.id)} aria-expanded={isOpen} className="flex min-h-14 w-full items-center justify-between gap-2 px-4 py-3 text-left">
                <div className="min-w-0">
                  <h4 className="text-[15px] font-extrabold text-black dark:text-zinc-50">{module.title}</h4>
                  <p className="text-[13px] text-zinc-500 dark:text-zinc-400">
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
  readOnly = false,
  profile,
}: {
  clientId: string;
  isCoachView: boolean;
  // Narrower than isCoachView -- see FormsTab's identical prop for why this can't just be
  // isCoachView=false for a read-only cross-coach view.
  readOnly?: boolean;
  profile?: ClientProfileRow | null;
}) {
  // The courses and assignments are read when this screen opens (R13/M1), and again after a save on it.
  const education = useOnDemand(() => getEducationForClient(clientId, isCoachView), `${clientId}:${isCoachView}`);
  const courses = education.data?.courses ?? [];
  const assignments = education.data?.assignments ?? [];
  const { run, busy: assigning } = useAction();
  const [selectedCourse, setSelectedCourse] = useState('');
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [startLessonId, setStartLessonId] = useState<string | null>(null);
  const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
  const carryOn = isCoachView ? null : nextLesson(assignments, todayIso);
  // The course bars fill when the list arrives.
  const screen = useRef<HTMLDivElement>(null);
  useGrowIn(screen, 0.1, assignments.length);

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
    <div ref={screen} className="space-y-6">
      {isCoachView && !readOnly && (
        <div className="rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
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
              className="shrink-0 inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground disabled:opacity-50"
            >
              {assigning ? 'Assigning…' : 'Assign'}
            </button>
          </form>
        </div>
      )}

      {education.data == null ? (
        <p className="text-sm text-zinc-500" role="status">
          {education.error ? 'Could not load the courses.' : 'Loading…'}{' '}
          {education.error && (
            <button type="button" onClick={education.reload} className="font-semibold text-accent underline">
              Try again
            </button>
          )}
        </p>
      ) : assignments.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="Nothing assigned yet"
          hint={isCoachView ? 'Assign a course above, or build one under Education.' : "Your coach hasn't assigned any courses yet."}
        />
      ) : !isCoachView ? (
        <>
          {carryOn && (
            <section className="space-y-2.5">
              <h2 className={headCls}>Carry on</h2>
              <button
                type="button"
                onClick={() => {
                  setStartLessonId(carryOn.lesson.id);
                  setOpenAssignmentId(carryOn.assignment.id);
                }}
                className={`${cardCls} flex w-full flex-col overflow-hidden text-left`}
              >
                <span aria-hidden className="flex h-[150px] items-center justify-center bg-[#1d1d1b] text-[#5fd6d6]">
                  {carryOn.lesson.link_url ? <PlayCircle className="h-11 w-11" strokeWidth={1.6} /> : <GraduationCap className="h-11 w-11" strokeWidth={1.6} />}
                </span>
                <span className="flex flex-col gap-1 px-4 pb-3.5 pt-3">
                  <span className="text-base font-extrabold text-black dark:text-zinc-50">{carryOn.lesson.title}</span>
                  <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                    {carryOn.assignment.course.title} · lesson {carryOn.number} of {carryOn.total}
                  </span>
                </span>
              </button>
            </section>
          )}
          <section className="space-y-2.5">
            <h2 className={headCls}>Courses</h2>
            <div className={`${cardCls} divide-y divide-black/[.07] overflow-hidden dark:divide-white/10`}>
              {assignments.map((a) => {
                const { lessons, doneCount } = courseLessons(a);
                const share = lessons.length ? Math.round((doneCount / lessons.length) * 100) : 0;
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setStartLessonId(null);
                      setOpenAssignmentId(a.id);
                    }}
                    className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-[15px] font-bold text-black dark:text-zinc-50">{a.course.title}</span>
                      <span className="text-[13px] text-zinc-500 dark:text-zinc-400">
                        {lessons.length > 0 && doneCount >= lessons.length ? 'All lessons done' : `${doneCount} of ${lessons.length} lesson${lessons.length === 1 ? '' : 's'} done`}
                      </span>
                    </span>
                    <span className="h-2 w-16 shrink-0 overflow-hidden rounded-full bg-black/10 dark:bg-white/15" role="img" aria-label={`${doneCount} of ${lessons.length} lessons`}>
                      <span data-grow="bar" className="block h-2 rounded-full bg-accent" style={{ width: `${share}%` }} />
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-zinc-400" />
                  </button>
                );
              })}
            </div>
          </section>
        </>
      ) : (
        <ul className="space-y-2">
          {assignments.map((a) => {
            const pct = courseCompletionPercent(a.course, a.completions);
            return (
              <li key={a.id}>
                <button
                  onClick={() => setOpenAssignmentId(a.id)}
                  className="w-full rounded-[20px] border border-black/[.08] bg-card p-4 text-left dark:border-white/10"
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
          startLessonId={startLessonId}
        />
      )}
    </div>
  );
}
