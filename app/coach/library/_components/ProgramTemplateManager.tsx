'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import {
  addTemplateDay,
  addTemplateExercise,
  createProgramTemplate,
  deleteProgramTemplate,
  deleteTemplateDay,
  deleteTemplateExercise,
  duplicateProgramTemplate,
  swapTemplateExerciseOrder,
} from '@/lib/data/programTemplates';
import type { ExerciseLibraryRow, ProgramTemplateExerciseRow, ProgramTemplateWithDays } from '@/lib/data/types';

const MUSCLE_GROUPS = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Full Body', 'Mobility'];

function groupBySuperset(
  exercises: ProgramTemplateExerciseRow[]
): { group: string | null; exercises: ProgramTemplateExerciseRow[] }[] {
  const groups: { group: string | null; exercises: ProgramTemplateExerciseRow[] }[] = [];
  for (const ex of exercises) {
    const last = groups[groups.length - 1];
    if (last && last.group === ex.superset_group && ex.superset_group != null) {
      last.exercises.push(ex);
    } else {
      groups.push({ group: ex.superset_group, exercises: [ex] });
    }
  }
  return groups;
}

function AddTemplateExerciseForm({
  templateDayId,
  library,
  nextSortOrder,
}: {
  templateDayId: string;
  library: ExerciseLibraryRow[];
  nextSortOrder: number;
}) {
  const { run, busy } = useAction();
  const [libraryId, setLibraryId] = useState('');
  const [name, setName] = useState('');
  const [sets, setSets] = useState<number | ''>(3);
  const [reps, setReps] = useState('8-10');
  const [load, setLoad] = useState<number | ''>('');
  const [rpe, setRpe] = useState<number | ''>('');
  const [videoUrl, setVideoUrl] = useState('');
  const [supersetGroup, setSupersetGroup] = useState('');
  const [restSeconds, setRestSeconds] = useState<number | ''>('');
  const [filterGroup, setFilterGroup] = useState('');

  function handlePickLibrary(id: string) {
    setLibraryId(id);
    const entry = library.find((e) => e.id === id);
    if (!entry) return;
    setName(entry.name);
    if (entry.default_sets != null) setSets(entry.default_sets);
    if (entry.default_reps != null) setReps(entry.default_reps);
    if (entry.default_rpe != null) setRpe(entry.default_rpe);
    if (entry.video_url != null) setVideoUrl(entry.video_url);
    if (entry.default_rest_seconds != null) setRestSeconds(entry.default_rest_seconds);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        addTemplateExercise(templateDayId, {
          exercise_library_id: libraryId || null,
          name,
          sets: sets === '' ? null : sets,
          reps: reps || null,
          load: load === '' ? null : load,
          rpe: rpe === '' ? null : rpe,
          notes: null,
          video_url: videoUrl || null,
          superset_group: supersetGroup || null,
          rest_seconds: restSeconds === '' ? null : restSeconds,
          sort_order: nextSortOrder,
        }),
      {
        success: 'Exercise added',
        onDone: () => {
          setLibraryId('');
          setName('');
          setVideoUrl('');
          setSupersetGroup('');
          setRestSeconds('');
        },
      }
    );
  }

  const filteredLibrary = filterGroup ? library.filter((e) => e.muscle_group === filterGroup) : library;
  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10';

  return (
    <form onSubmit={handleSubmit} className="mt-2 flex flex-wrap items-center gap-1.5">
      {library.length > 0 && (
        <>
          <select className={`${inputCls} w-24`} value={filterGroup} onChange={(e) => setFilterGroup(e.target.value)}>
            <option value="">All groups</option>
            {MUSCLE_GROUPS.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
          <select className={`${inputCls} w-40`} value={libraryId} onChange={(e) => handlePickLibrary(e.target.value)}>
            <option value="">From library…</option>
            {filteredLibrary.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </>
      )}
      <input required placeholder="Exercise" className={`${inputCls} w-32`} value={name} onChange={(e) => setName(e.target.value)} />
      <input type="number" placeholder="Sets" className={`${inputCls} w-16`} value={sets} onChange={(e) => setSets(e.target.value === '' ? '' : Number(e.target.value))} />
      <input placeholder="Reps" className={`${inputCls} w-20`} value={reps} onChange={(e) => setReps(e.target.value)} />
      <input type="number" placeholder="Load" className={`${inputCls} w-16`} value={load} onChange={(e) => setLoad(e.target.value === '' ? '' : Number(e.target.value))} />
      <input type="number" placeholder="RPE" className={`${inputCls} w-16`} value={rpe} onChange={(e) => setRpe(e.target.value === '' ? '' : Number(e.target.value))} />
      <input placeholder="Superset (e.g. A)" className={`${inputCls} w-24`} value={supersetGroup} onChange={(e) => setSupersetGroup(e.target.value)} />
      <input type="number" placeholder="Rest (s)" className={`${inputCls} w-20`} value={restSeconds} onChange={(e) => setRestSeconds(e.target.value === '' ? '' : Number(e.target.value))} />
      <input placeholder="Video URL (optional)" className={`${inputCls} w-40`} value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)} />
      <button type="submit" disabled={busy} className="rounded-md bg-accent px-2.5 py-1 text-xs font-medium text-accent-foreground disabled:opacity-50">
        Add
      </button>
    </form>
  );
}

export function ProgramTemplateManager({
  initialTemplates,
  library,
}: {
  initialTemplates: ProgramTemplateWithDays[];
  library: ExerciseLibraryRow[];
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const { run: runDuplicate } = useAction();
  const [newTemplateName, setNewTemplateName] = useState('');
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string }>>({});
  const [previewId, setPreviewId] = useState<string | null>(null);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createProgramTemplate(newTemplateName), {
      success: 'Programme template created',
      onDone: () => setNewTemplateName(''),
    });
  }

  async function handleAddDay(templateId: string) {
    const form = dayForms[templateId] ?? { weekNum: 1, dayLabel: 'Day 1' };
    await runMutate(() => addTemplateDay(templateId, form.weekNum, form.dayLabel), { success: 'Day added' });
  }

  async function handleDeleteTemplate(templateId: string, name: string) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: 'This removes every week, day and exercise in the template. Clients who already started this programme keep their own copy.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteProgramTemplate(templateId), { success: 'Template deleted' });
  }

  async function handleDeleteDay(dayId: string, label: string) {
    const ok = await confirm({ title: `Delete “${label}”?`, body: 'This removes the day and all its exercises.', destructive: true });
    if (!ok) return;
    await runMutate(() => deleteTemplateDay(dayId), { success: 'Day deleted' });
  }

  async function handleDeleteExercise(exerciseId: string, name: string) {
    const ok = await confirm({ title: `Delete “${name}”?`, destructive: true });
    if (!ok) return;
    await runMutate(() => deleteTemplateExercise(exerciseId), { success: 'Exercise deleted' });
  }

  async function handleDuplicate(templateId: string, name: string) {
    await runDuplicate(() => duplicateProgramTemplate(templateId, `${name} (copy)`), { success: 'Template duplicated' });
  }

  async function handleMoveExercise(exercises: ProgramTemplateExerciseRow[], index: number, direction: -1 | 1) {
    const other = exercises[index + direction];
    if (!other) return;
    const current = exercises[index];
    await runMutate(() => swapTemplateExerciseOrder(current, other));
  }

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreateTemplate} className="flex items-end gap-2 rounded-lg border border-black/10 p-4 dark:border-white/10">
        <div className="flex-1 space-y-1">
          <label className="text-xs font-medium text-zinc-500">New template name</label>
          <input
            required
            className="w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10"
            value={newTemplateName}
            onChange={(e) => setNewTemplateName(e.target.value)}
          />
        </div>
        <button type="submit" disabled={creating} className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50">
          {creating ? 'Creating…' : 'Create template'}
        </button>
      </form>

      {initialTemplates.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No programme templates yet"
          hint="Build one here, then start it on any client from their Training tab instead of building each program from scratch."
        />
      )}

      {initialTemplates.map((template) => {
        const preview = previewId === template.id;
        return (
        <div key={template.id} className="rounded-lg border border-black/10 p-4 dark:border-white/10">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPreviewId(preview ? null : template.id)}
              className="text-left font-medium text-black hover:underline dark:text-zinc-50"
            >
              {template.name}
            </button>
            <div className="flex items-center gap-3">
              <button onClick={() => handleDuplicate(template.id, template.name)} className="text-xs text-zinc-500 hover:underline">
                Duplicate
              </button>
              <button onClick={() => handleDeleteTemplate(template.id, template.name)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                Delete template
              </button>
            </div>
          </div>

          {!preview && (
            <p className="mt-1 text-xs text-zinc-500">
              {template.program_template_days.length} day{template.program_template_days.length === 1 ? '' : 's'} — click the name to preview and edit.
            </p>
          )}

          {preview && [...template.program_template_days]
            .sort((a, b) => a.week_num - b.week_num)
            .map((day) => {
              const sortedExercises = [...day.program_template_exercises].sort((a, b) => a.sort_order - b.sort_order);
              const supersetGroups = groupBySuperset(sortedExercises);
              return (
              <div key={day.id} className="mt-3 rounded-md border border-black/5 p-3 dark:border-white/5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium">
                    Week {day.week_num} — {day.day_label}
                  </p>
                  <button onClick={() => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                    Delete day
                  </button>
                </div>

                <ul className="mt-2 space-y-2">
                  {supersetGroups.map((sg, sgIndex) => (
                    <li key={sgIndex} className={sg.group ? 'space-y-1 rounded-md border border-accent/30 p-1.5' : 'space-y-1'}>
                      {sg.group && <p className="px-1 text-[10px] font-semibold text-accent">Superset {sg.group}</p>}
                      {sg.exercises.map((ex) => {
                        const indexInDay = sortedExercises.findIndex((e) => e.id === ex.id);
                        return (
                          <div key={ex.id} className="rounded-md bg-black/[.02] p-2 text-sm dark:bg-white/[.03]">
                            <div className="flex items-center justify-between gap-2">
                              <span>
                                {ex.name} — {ex.sets}×{ex.reps}
                                {ex.load != null ? ` @ ${ex.load}` : ''}
                                {ex.rpe != null ? ` RPE ${ex.rpe}` : ''}
                                {ex.rest_seconds != null ? ` · ${ex.rest_seconds}s rest` : ''}
                              </span>
                              <div className="flex shrink-0 items-center gap-2">
                                <button
                                  onClick={() => handleMoveExercise(sortedExercises, indexInDay, -1)}
                                  disabled={indexInDay === 0}
                                  aria-label="Move up"
                                  className="text-xs text-zinc-500 hover:text-black disabled:opacity-30 dark:hover:text-zinc-200"
                                >
                                  ▲
                                </button>
                                <button
                                  onClick={() => handleMoveExercise(sortedExercises, indexInDay, 1)}
                                  disabled={indexInDay === sortedExercises.length - 1}
                                  aria-label="Move down"
                                  className="text-xs text-zinc-500 hover:text-black disabled:opacity-30 dark:hover:text-zinc-200"
                                >
                                  ▼
                                </button>
                                <button onClick={() => handleDeleteExercise(ex.id, ex.name)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                                  Delete
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </li>
                  ))}
                </ul>

                <AddTemplateExerciseForm templateDayId={day.id} library={library} nextSortOrder={sortedExercises.length} />
              </div>
              );
            })}

          {preview && (
            <div className="mt-3 flex items-center gap-1.5">
              <input
                type="number"
                placeholder="Week"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[template.id]?.weekNum ?? 1}
                onChange={(e) =>
                  setDayForms({ ...dayForms, [template.id]: { weekNum: Number(e.target.value), dayLabel: dayForms[template.id]?.dayLabel ?? 'Day 1' } })
                }
              />
              <input
                placeholder="Day label"
                className="w-32 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[template.id]?.dayLabel ?? 'Day 1'}
                onChange={(e) =>
                  setDayForms({ ...dayForms, [template.id]: { weekNum: dayForms[template.id]?.weekNum ?? 1, dayLabel: e.target.value } })
                }
              />
              <button
                onClick={() => handleAddDay(template.id)}
                className="rounded-md border border-black/10 px-2.5 py-1 text-xs font-medium dark:border-white/10"
              >
                Add day
              </button>
            </div>
          )}
        </div>
        );
      })}
    </div>
  );
}
