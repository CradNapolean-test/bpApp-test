'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, GraduationCap } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import {
  addLesson,
  addModule,
  createCourse,
  deleteCourse,
  deleteLesson,
  deleteModule,
  reorderLessons,
  reorderModules,
  updateLesson,
} from '@/lib/data/education';
import type { EducationCourseWithModules, EducationLessonRow, EducationModuleWithLessons } from '@/lib/data/types';

const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';
const smallInputCls = 'w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

function LessonRow({
  lesson,
  index,
  count,
  onMove,
}: {
  lesson: EducationLessonRow;
  index: number;
  count: number;
  onMove: (index: number, direction: -1 | 1) => void;
}) {
  const { run } = useAction();
  const [title, setTitle] = useState(lesson.title);
  const [body, setBody] = useState(lesson.body ?? '');
  const [linkUrl, setLinkUrl] = useState(lesson.link_url ?? '');
  const [unlockAt, setUnlockAt] = useState(lesson.unlock_at ?? '');
  const confirm = useConfirm();
  const { run: runDelete } = useAction();

  function commit(field: 'title' | 'body' | 'link_url' | 'unlock_at', value: string, initial: string) {
    if (value === initial) return;
    run(() => updateLesson(lesson.id, { [field]: value || null }));
  }

  async function handleDelete() {
    const ok = await confirm({ title: `Delete "${lesson.title}"?`, body: 'This cannot be undone.', destructive: true });
    if (!ok) return;
    await runDelete(() => deleteLesson(lesson.id), { success: 'Lesson deleted' });
  }

  return (
    <div className="space-y-2 rounded-md border border-black/5 p-3 dark:border-white/5">
      <div className="flex items-center gap-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => commit('title', title, lesson.title)}
          className={`${inputCls} flex-1 font-medium`}
        />
        <button onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move lesson up" className="rounded-md p-1 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Move lesson down" className="rounded-md p-1 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
        <Button variant="danger" size="sm" onClick={handleDelete}>
          Delete
        </Button>
      </div>
      <textarea
        placeholder="Body (optional)"
        rows={2}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onBlur={() => commit('body', body, lesson.body ?? '')}
        className={inputCls}
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          placeholder="Link URL (optional)"
          value={linkUrl}
          onChange={(e) => setLinkUrl(e.target.value)}
          onBlur={() => commit('link_url', linkUrl, lesson.link_url ?? '')}
          className={`${smallInputCls} flex-1`}
        />
        <label className="flex items-center gap-1.5 text-xs text-zinc-500">
          Available from
          <input
            type="date"
            value={unlockAt}
            onChange={(e) => setUnlockAt(e.target.value)}
            onBlur={() => commit('unlock_at', unlockAt, lesson.unlock_at ?? '')}
            className={smallInputCls}
          />
        </label>
      </div>
    </div>
  );
}

function AddLessonForm({ moduleId }: { moduleId: string }) {
  const { run, busy } = useAction();
  const [title, setTitle] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    await run(() => addLesson(moduleId, { title, body: null, link_url: null, unlock_at: null }), {
      success: 'Lesson added',
      onDone: () => setTitle(''),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex items-center gap-2">
      <input
        placeholder="New lesson title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        className={`${smallInputCls} flex-1`}
      />
      <button type="submit" disabled={busy} className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium disabled:opacity-50 dark:border-white/10">
        + Add lesson
      </button>
    </form>
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
  const { run: runDelete } = useAction();
  const { run: runReorder } = useAction();
  const sortedLessons = [...module.education_lessons].sort((a, b) => a.sort_order - b.sort_order);

  async function handleDeleteModule() {
    const ok = await confirm({
      title: `Delete "${module.title}"?`,
      body: 'This removes the module and every lesson in it.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteModule(module.id), { success: 'Module deleted' });
  }

  async function handleMoveLesson(lessonIndex: number, direction: -1 | 1) {
    const reordered = [...sortedLessons];
    const target = lessonIndex + direction;
    if (target < 0 || target >= reordered.length) return;
    [reordered[lessonIndex], reordered[target]] = [reordered[target], reordered[lessonIndex]];
    await runReorder(() => reorderLessons(reordered.map((l) => l.id)));
  }

  return (
    <div className="space-y-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-medium text-black dark:text-zinc-50">{module.title}</h4>
        <div className="flex items-center gap-1">
          <button onClick={() => onMove(index, -1)} disabled={index === 0} aria-label="Move module up" className="rounded-md p-1 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
            <ChevronUp className="h-3.5 w-3.5" />
          </button>
          <button onClick={() => onMove(index, 1)} disabled={index === count - 1} aria-label="Move module down" className="rounded-md p-1 text-zinc-500 hover:bg-black/5 disabled:opacity-30 dark:hover:bg-white/5">
            <ChevronDown className="h-3.5 w-3.5" />
          </button>
          <Button variant="danger" size="sm" onClick={handleDeleteModule}>
            Delete module
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {sortedLessons.map((lesson, i) => (
          <LessonRow key={lesson.id} lesson={lesson} index={i} count={sortedLessons.length} onMove={handleMoveLesson} />
        ))}
      </div>
      <AddLessonForm moduleId={module.id} />
    </div>
  );
}

function CourseOverlay({
  course,
  onClose,
  onDelete,
}: {
  course: EducationCourseWithModules;
  onClose: () => void;
  onDelete: (id: string, courseTitle: string) => void;
}) {
  const { run: runAddModule, busy: addingModule } = useAction();
  const { run: runReorder } = useAction();
  const [newModuleTitle, setNewModuleTitle] = useState('');
  const sortedModules = [...course.education_modules].sort((a, b) => a.sort_order - b.sort_order);

  async function handleAddModule(e: React.FormEvent) {
    e.preventDefault();
    if (!newModuleTitle.trim()) return;
    await runAddModule(() => addModule(course.id, newModuleTitle), {
      success: 'Module added',
      onDone: () => setNewModuleTitle(''),
    });
  }

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
        <Button variant="danger" size="sm" onClick={() => onDelete(course.id, course.title)}>
          Delete
        </Button>
      }
    >
      <div className="space-y-4">
        {sortedModules.map((module, i) => (
          <ModuleSection key={module.id} module={module} index={i} count={sortedModules.length} onMove={handleMoveModule} />
        ))}
        <form onSubmit={handleAddModule} className="flex items-center gap-2">
          <input
            placeholder="New module title"
            value={newModuleTitle}
            onChange={(e) => setNewModuleTitle(e.target.value)}
            className={`${inputCls} flex-1`}
          />
          <button type="submit" disabled={addingModule} className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10">
            + Add module
          </button>
        </form>
      </div>
    </FocusOverlay>
  );
}

export function EducationPane({ initialCourses }: { initialCourses: EducationCourseWithModules[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runDelete } = useAction();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [openCourseId, setOpenCourseId] = useState<string | null>(null);
  const [addingCourse, setAddingCourse] = useState(false);
  const openCourse = openCourseId ? initialCourses.find((c) => c.id === openCourseId) : undefined;

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createCourse(title, description || null), {
      success: 'Course added',
      onDone: () => {
        setTitle('');
        setDescription('');
        setAddingCourse(false);
      },
    });
  }

  async function handleDelete(id: string, courseTitle: string) {
    const ok = await confirm({
      title: `Delete "${courseTitle}"?`,
      body: 'Every module, lesson and assignment of this course is removed too. This cannot be undone.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteCourse(id), { success: 'Course deleted' });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingCourse(true)}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + New course
        </button>
      </div>

      {addingCourse && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Title</label>
            <input required autoFocus className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Description (optional)</label>
            <textarea rows={2} className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Adding…' : 'Add course'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAddingCourse(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {initialCourses.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No courses yet"
          hint="Add a course above, then build out its modules and lessons, then assign it to clients from their Accountability tab."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {initialCourses.map((c) => {
            const lessonCount = c.education_modules.reduce((sum, m) => sum + m.education_lessons.length, 0);
            return (
              <div
                key={c.id}
                className="rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{c.title}</p>
                  <div className="flex shrink-0 gap-2.5 text-sm font-semibold">
                    <button type="button" onClick={() => setOpenCourseId(c.id)} className="text-black hover:underline dark:text-zinc-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(c.id, c.title)} className="text-danger hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                {c.description && <p className="mt-0.5 text-sm text-zinc-500">{c.description}</p>}
                <p className="mt-1 text-sm font-semibold text-[#19adb1]">
                  {c.education_modules.length} module{c.education_modules.length === 1 ? '' : 's'} · {lessonCount} lesson{lessonCount === 1 ? '' : 's'}
                </p>
              </div>
            );
          })}
        </div>
      )}

      {openCourse && <CourseOverlay course={openCourse} onClose={() => setOpenCourseId(null)} onDelete={handleDelete} />}
    </div>
  );
}
