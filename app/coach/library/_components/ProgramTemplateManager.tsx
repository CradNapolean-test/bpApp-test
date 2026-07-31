'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import {
  addTemplateDay,
  addTemplateExercise,
  createProgramTemplate,
  deleteProgramTemplate,
  deleteTemplateDay,
  deleteTemplateExercise,
  duplicateProgramTemplate,
  reorderTemplateExercises,
  updateTemplateDay,
  updateTemplateExercise,
} from '@/lib/data/programTemplates';
import type { ExerciseLibraryRow, ProgramTemplateWithDays } from '@/lib/data/types';

function PhaseLabelInput({ dayId, initial }: { dayId: string; initial: string | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial ?? '');

  async function handleBlur() {
    if (value === (initial ?? '')) return;
    await run(() => updateTemplateDay(dayId, { phase_label: value || null }));
  }

  return (
    <input
      placeholder="Phase (optional)"
      className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
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

  async function handleDuplicate(templateId: string, name: string) {
    await runDuplicate(() => duplicateProgramTemplate(templateId, `${name} (copy)`), { success: 'Template duplicated' });
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
            .map((day) => (
              <div key={day.id} className="mt-3 rounded-md border border-black/5 p-3 dark:border-white/5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Week {day.week_num} — {day.day_label}
                  </p>
                  <div className="flex shrink-0 items-center gap-2">
                    <PhaseLabelInput dayId={day.id} initial={day.phase_label} />
                    <button onClick={() => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`)} className="text-xs text-red-600 hover:underline dark:text-red-400">
                      Delete day
                    </button>
                  </div>
                </div>

                <ExerciseEditor
                  exercises={day.program_template_exercises}
                  library={library}
                  canEdit
                  showProgression
                  onAdd={(fields) => addTemplateExercise(day.id, fields)}
                  onUpdate={(id, fields) => updateTemplateExercise(id, fields)}
                  onDelete={(id) => deleteTemplateExercise(id)}
                  onReorder={reorderTemplateExercises}
                />
              </div>
            ))}

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
