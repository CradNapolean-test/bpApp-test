'use client';

import { useState } from 'react';
import { GraduationCap, Link2, Lock } from 'lucide-react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import {
  addLesson,
  addModule,
  assignCourseToMany,
  createCourse,
  deleteCourse,
  deleteLesson,
  deleteModule,
  reorderLessons,
  reorderModules,
  updateCourse,
  updateLesson,
  updateModule,
} from '@/lib/data/education';
import type {
  ClientGroupWithMembers,
  CourseRollupRow,
  EducationCourseWithModules,
  EducationLessonRow,
  EducationModuleWithLessons,
} from '@/lib/data/types';

const field = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10';

const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500">{label}</label>
      {children}
    </div>
  );
}

const primaryBtn = 'w-full rounded-full bg-accent py-3 text-sm font-extrabold text-accent-foreground disabled:opacity-50';

// A sheet with one text box (and optionally a second, longer one): naming a module, a course, a new course.
function TextSheet({
  title,
  label,
  initial,
  secondLabel,
  secondInitial,
  confirmLabel = 'Save',
  onSave,
  onClose,
}: {
  title: string;
  label: string;
  initial: string;
  secondLabel?: string;
  secondInitial?: string;
  confirmLabel?: string;
  onSave: (value: string, second: string) => Promise<unknown>;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [value, setValue] = useState(initial);
  const [second, setSecond] = useState(secondInitial ?? '');
  return (
    <BottomSheet title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!value.trim()) return;
          run(() => onSave(value.trim(), second.trim()), { success: 'Saved', onDone: onClose });
        }}
        className="space-y-4"
      >
        <Labeled label={label}>
          <input autoFocus required className={field} value={value} onChange={(e) => setValue(e.target.value)} />
        </Labeled>
        {secondLabel && (
          <Labeled label={secondLabel}>
            <textarea rows={3} className={field} value={second} onChange={(e) => setSecond(e.target.value)} />
          </Labeled>
        )}
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? 'Saving…' : confirmLabel}
        </button>
      </form>
    </BottomSheet>
  );
}

// Add a lesson, or edit one. Saved with the button, so it is clear it has gone in.
function LessonSheet({
  lesson,
  moduleId,
  onClose,
}: {
  lesson: EducationLessonRow | null;
  moduleId: string;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [title, setTitle] = useState(lesson?.title ?? '');
  const [body, setBody] = useState(lesson?.body ?? '');
  const [linkUrl, setLinkUrl] = useState(lesson?.link_url ?? '');
  const [unlockAt, setUnlockAt] = useState(lesson?.unlock_at ?? '');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields = {
      title: title.trim(),
      body: body.trim() || null,
      link_url: linkUrl.trim() || null,
      unlock_at: unlockAt || null,
    };
    await run(() => (lesson ? updateLesson(lesson.id, fields) : addLesson(moduleId, fields)), {
      success: lesson ? 'Lesson saved' : 'Lesson added',
      onDone: onClose,
    });
  }

  return (
    <BottomSheet title={lesson ? 'Edit lesson' : 'Add a lesson'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <Labeled label="Title">
          <input required autoFocus={!lesson} className={field} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Labeled>
        <Labeled label="Video or link (optional)">
          <input className={field} value={linkUrl} placeholder="https://" onChange={(e) => setLinkUrl(e.target.value)} />
        </Labeled>
        <Labeled label="Lesson text (optional)">
          <textarea rows={9} className={field} value={body} onChange={(e) => setBody(e.target.value)} />
        </Labeled>
        <Labeled label="Available from (optional)">
          <input type="date" className={field} value={unlockAt} onChange={(e) => setUnlockAt(e.target.value)} />
        </Labeled>
        <button type="submit" disabled={busy} className={primaryBtn}>
          {busy ? 'Saving…' : lesson ? 'Save lesson' : 'Add lesson'}
        </button>
      </form>
    </BottomSheet>
  );
}

function ModuleSection({
  module,
  index,
  count,
  onMove,
}: {
  module: EducationModuleWithLessons;
  index: number;
  count: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const confirm = useConfirm();
  const { run } = useAction();
  const [sheet, setSheet] = useState<{ kind: 'lesson'; lesson: EducationLessonRow | null } | { kind: 'rename' } | null>(null);
  const sortedLessons = [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);

  async function handleDeleteModule() {
    const ok = await confirm({
      title: `Delete "${module.title}"?`,
      body: 'This removes the module and every lesson in it.',
      destructive: true,
    });
    if (!ok) return;
    await run(() => deleteModule(module.id), { success: 'Module deleted' });
  }

  async function handleDeleteLesson(lesson: EducationLessonRow) {
    const ok = await confirm({ title: `Delete "${lesson.title}"?`, body: 'This cannot be undone.', destructive: true });
    if (!ok) return;
    await run(() => deleteLesson(lesson.id), { success: 'Lesson deleted' });
  }

  async function moveLesson(lessonIndex: number, direction: -1 | 1) {
    const reordered = [...sortedLessons];
    const target = lessonIndex + direction;
    if (target < 0 || target >= reordered.length) return;
    [reordered[lessonIndex], reordered[target]] = [reordered[target], reordered[lessonIndex]];
    await run(() => reorderLessons(reordered.map((l) => l.id)));
  }

  return (
    <div className="space-y-3 rounded-2xl border border-black/[.06] bg-card p-3.5 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h4 className="truncate font-extrabold text-black dark:text-zinc-50">{module.title}</h4>
          <p className="text-xs text-zinc-500">
            {sortedLessons.length} lesson{sortedLessons.length === 1 ? '' : 's'}
          </p>
        </div>
        <DropdownMenu
          triggerLabel={`More actions for ${module.title}`}
          items={[
            { label: 'Rename', onSelect: () => setSheet({ kind: 'rename' }) },
            ...(index > 0 ? [{ label: 'Move up', onSelect: () => onMove(index, -1) }] : []),
            ...(index < count - 1 ? [{ label: 'Move down', onSelect: () => onMove(index, 1) }] : []),
            { label: 'Delete module', destructive: true, onSelect: handleDeleteModule },
          ]}
        />
      </div>

      <div className="space-y-2">
        {sortedLessons.map((lesson, i) => (
          <div key={lesson.id} className="flex items-center gap-2 rounded-xl border border-black/[.06] px-3 py-2.5 dark:border-white/10">
            <button type="button" onClick={() => setSheet({ kind: 'lesson', lesson })} className="min-w-0 flex-1 text-left">
              <span className="block truncate text-sm font-bold text-black dark:text-zinc-50">{lesson.title}</span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-zinc-500">
                {lesson.link_url && (
                  <span className="flex items-center gap-1">
                    <Link2 className="h-3 w-3" /> Video or link
                  </span>
                )}
                {lesson.unlock_at && (
                  <span className="flex items-center gap-1">
                    <Lock className="h-3 w-3" /> Opens {shortDate(lesson.unlock_at)}
                  </span>
                )}
                {!lesson.link_url && !lesson.unlock_at && <span>{lesson.body ? 'Text only' : 'Empty, tap to add content'}</span>}
              </span>
            </button>
            <DropdownMenu
              triggerLabel={`More actions for ${lesson.title}`}
              items={[
                { label: 'Edit', onSelect: () => setSheet({ kind: 'lesson', lesson }) },
                ...(i > 0 ? [{ label: 'Move up', onSelect: () => moveLesson(i, -1) }] : []),
                ...(i < sortedLessons.length - 1 ? [{ label: 'Move down', onSelect: () => moveLesson(i, 1) }] : []),
                { label: 'Delete lesson', destructive: true, onSelect: () => handleDeleteLesson(lesson) },
              ]}
            />
          </div>
        ))}
      </div>

      <button
        type="button"
        onClick={() => setSheet({ kind: 'lesson', lesson: null })}
        className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-700 dark:border-white/15 dark:text-zinc-200"
      >
        + Add lesson
      </button>

      {sheet?.kind === 'lesson' && <LessonSheet lesson={sheet.lesson} moduleId={module.id} onClose={() => setSheet(null)} />}
      {sheet?.kind === 'rename' && (
        <TextSheet
          title="Rename module"
          label="Module name"
          initial={module.title}
          onSave={(name) => updateModule(module.id, name)}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

// Give a course to members: everyone this coach looks after, a group, or a handpicked few. Anyone who
// already has it is left alone.
function AssignSheet({
  course,
  members,
  groups,
  assignedIds,
  onClose,
}: {
  course: EducationCourseWithModules;
  members: { id: string; name: string }[];
  groups: ClientGroupWithMembers[];
  assignedIds: Set<string>;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [audience, setAudience] = useState<'all' | 'group' | 'choose'>('all');
  const [groupId, setGroupId] = useState('');
  const [picked, setPicked] = useState<string[]>([]);
  const [search, setSearch] = useState('');

  const mine = new Set(members.map((m) => m.id));
  const groupIds = (groups.find((g) => g.id === groupId)?.memberIds ?? []).filter((id) => mine.has(id));
  const chosen =
    audience === 'all' ? members.map((m) => m.id) : audience === 'group' ? groupIds : picked;
  const targets = chosen.filter((id) => !assignedIds.has(id));
  const skipped = chosen.length - targets.length;
  const shown = members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()));

  return (
    <BottomSheet title={`Assign “${course.title}”`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {([
            ['all', 'Everyone I coach'],
            ...(groups.length > 0 ? ([['group', 'A group']] as const) : []),
            ['choose', 'Choose members'],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setAudience(key)}
              className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                audience === key ? 'bg-accent text-accent-foreground' : 'border border-black/10 dark:border-white/15'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {audience === 'group' && (
          <Labeled label="Group">
            <select className={field} value={groupId} onChange={(e) => setGroupId(e.target.value)}>
              <option value="">Choose a group…</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} ({g.memberIds.length})
                </option>
              ))}
            </select>
          </Labeled>
        )}

        {audience === 'choose' && (
          <div className="space-y-1.5">
            <input placeholder="Search your members" className={field} value={search} onChange={(e) => setSearch(e.target.value)} />
            <div className="max-h-56 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
              {shown.length === 0 && <p className="p-3 text-sm text-zinc-500">No members found.</p>}
              {shown.map((m) => {
                const has = assignedIds.has(m.id);
                return (
                  <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                    <input
                      type="checkbox"
                      disabled={has}
                      checked={has || picked.includes(m.id)}
                      onChange={() => setPicked(picked.includes(m.id) ? picked.filter((x) => x !== m.id) : [...picked, m.id])}
                    />
                    <span className="flex-1 font-medium text-black dark:text-zinc-50">{m.name}</span>
                    {has && <span className="text-xs text-zinc-500">Already has it</span>}
                  </label>
                );
              })}
            </div>
          </div>
        )}

        {skipped > 0 && (
          <p className="text-xs text-zinc-500">
            {skipped} of these already {skipped === 1 ? 'has' : 'have'} it and will be left as they are.
          </p>
        )}

        <button
          type="button"
          disabled={busy || targets.length === 0}
          onClick={() => run(() => assignCourseToMany(course.id, targets), { success: `Assigned to ${targets.length}`, onDone: onClose })}
          className={primaryBtn}
        >
          {busy ? 'Assigning…' : targets.length === 0 ? 'Nobody new to assign' : `Assign to ${targets.length} member${targets.length === 1 ? '' : 's'}`}
        </button>
      </div>
    </BottomSheet>
  );
}

function CourseOverlay({
  course,
  members,
  groups,
  rollup,
  onClose,
  onDelete,
}: {
  course: EducationCourseWithModules;
  members: { id: string; name: string }[];
  groups: ClientGroupWithMembers[];
  rollup: CourseRollupRow[];
  onClose: () => void;
  onDelete: (id: string, courseTitle: string) => void;
}) {
  const { run: runReorder } = useAction();
  const [sheet, setSheet] = useState<'module' | 'details' | 'assign' | null>(null);
  const sortedModules = [...course.education_modules].sort((a, b) => a.sort_order - b.sort_order);
  const lessonTotal = sortedModules.reduce((n, m) => n + m.education_lessons.length, 0);
  const people = rollup.filter((r) => r.course_id === course.id);
  const nameOf = (id: string) => members.find((m) => m.id === id)?.name ?? 'Member';

  async function handleMoveModule(index: number, direction: -1 | 1) {
    const reordered = [...sortedModules];
    const target = index + direction;
    if (target < 0 || target >= reordered.length) return;
    [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
    await runReorder(() => reorderModules(reordered.map((m) => m.id)));
  }

  return (
    <FocusOverlay
      title={course.title}
      subtitle={course.description ?? undefined}
      onClose={onClose}
      headerActions={
        <DropdownMenu
          variant="header"
          triggerLabel="Course actions"
          items={[
            { label: 'Edit title and description', onSelect: () => setSheet('details') },
            { label: 'Delete course', destructive: true, onSelect: () => onDelete(course.id, course.title) },
          ]}
        />
      }
    >
      <div className="space-y-5">
        <button
          type="button"
          onClick={() => setSheet('assign')}
          className="rounded-full bg-accent px-5 py-2.5 text-sm font-extrabold text-accent-foreground"
        >
          Assign to members
        </button>

        {people.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm font-extrabold text-black dark:text-zinc-50">
              Who has it · {people.length}
            </p>
            <div className="divide-y divide-black/5 rounded-2xl border border-black/[.06] bg-card px-3.5 dark:divide-white/10 dark:border-white/10">
              {people.map((p) => {
                const pct = lessonTotal > 0 ? Math.round((p.done / lessonTotal) * 100) : 0;
                return (
                  <div key={p.client_id} className="py-2.5">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-semibold text-black dark:text-zinc-50">{nameOf(p.client_id)}</span>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {lessonTotal > 0 && p.done >= lessonTotal ? 'Finished' : `${p.done} of ${lessonTotal} lessons`}
                      </span>
                    </div>
                    <div className="mt-1 h-[5px] overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {sortedModules.length === 0 && (
            <p className="rounded-2xl border border-dashed border-black/10 p-4 text-sm text-zinc-500 dark:border-white/15">
              No modules yet. A module is a section of the course; add one, then put lessons in it.
            </p>
          )}
          {sortedModules.map((module, i) => (
            <ModuleSection key={module.id} module={module} index={i} count={sortedModules.length} onMove={handleMoveModule} />
          ))}
          <button
            type="button"
            onClick={() => setSheet('module')}
            className="rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-700 dark:border-white/15 dark:text-zinc-200"
          >
            + Add module
          </button>
        </div>
      </div>

      {sheet === 'module' && (
        <TextSheet
          title="Add a module"
          label="Module name"
          initial=""
          confirmLabel="Add module"
          onSave={(name) => addModule(course.id, name)}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'details' && (
        <TextSheet
          title="Course details"
          label="Title"
          initial={course.title}
          secondLabel="Description (optional)"
          secondInitial={course.description ?? ''}
          onSave={(title, description) => updateCourse(course.id, { title, description: description || null })}
          onClose={() => setSheet(null)}
        />
      )}
      {sheet === 'assign' && (
        <AssignSheet
          course={course}
          members={members}
          groups={groups}
          assignedIds={new Set(people.map((p) => p.client_id))}
          onClose={() => setSheet(null)}
        />
      )}
    </FocusOverlay>
  );
}

export function EducationPane({
  initialCourses,
  members,
  groups,
  rollup,
}: {
  initialCourses: EducationCourseWithModules[];
  members: { id: string; name: string }[];
  groups: ClientGroupWithMembers[];
  rollup: CourseRollupRow[];
}) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const openCourse = openCourseId ? initialCourses.find((c) => c.id === openCourseId) : undefined;

  async function handleDelete(id: string, courseTitle: string) {
    const ok = await confirm({
      title: `Delete "${courseTitle}"?`,
      body: 'Every module, lesson and assignment of this course is removed too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteCourse(id), { success: 'Course deleted', onDone: () => setOpenCourseId(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingCourse(true)}
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          + New course
        </button>
      </div>

      {addingCourse && (
        <TextSheet
          title="New course"
          label="Title"
          initial=""
          secondLabel="Description (optional)"
          confirmLabel="Add course"
          onSave={(title, description) => createCourse(title, description || null)}
          onClose={() => setAddingCourse(false)}
        />
      )}

      {initialCourses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          hint="Add a course, build out its modules and lessons, then assign it to members, all from here."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {initialCourses.map((c) => {
            const lessonCount = c.education_modules.reduce((sum, m) => sum + m.education_lessons.length, 0);
            const people = rollup.filter((r) => r.course_id === c.id);
            const finished = people.filter((p) => lessonCount > 0 && p.done >= lessonCount).length;
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-black/[.05] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{c.title}</p>
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1 text-sm font-semibold">
                    <button type="button" onClick={() => setOpenCourseId(c.id)} className="rounded-full px-2.5 py-1 text-accent hover:bg-accent/10">
                      Edit
                    </button>
                    <DropdownMenu
                      triggerLabel={`More actions for ${c.title}`}
                      items={[{ label: 'Delete course', destructive: true, onSelect: () => handleDelete(c.id, c.title) }]}
                    />
                  </div>
                </div>
                {c.description && <p className="mt-0.5 line-clamp-2 text-sm text-zinc-500">{c.description}</p>}
                <p className="mt-1 text-sm font-semibold text-accent">
                  {c.education_modules.length} module{c.education_modules.length === 1 ? '' : 's'} · {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
                </p>
                <p className="mt-1 text-xs text-zinc-500">
                  {people.length === 0
                    ? 'Not assigned to anyone yet'
                    : `${people.length} assigned · ${finished} finished`}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {openCourse && (
        <CourseOverlay
          course={openCourse}
          members={members}
          groups={groups}
          rollup={rollup}
          onClose={() => setOpenCourseId(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
