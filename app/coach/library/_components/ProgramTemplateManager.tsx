'use client';

import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { ProgramDayList, type ProgramDaySummary } from '@/app/_components/workouts/ProgramDayList';
import {
  addTemplateDay,
  addTemplateExercise,
  createProgramTemplate,
  deleteProgramTemplate,
  deleteTemplateDay,
  deleteTemplateExercise,
  duplicateProgramTemplate,
  duplicateTemplateDay,
  instantiateProgramTemplate,
  reorderTemplateExercises,
  updateTemplateDay,
  updateTemplateExercise,
} from '@/lib/data/programTemplates';
import type { ClientGroupWithMembers, ExerciseLibraryRow, ProgramTemplateWithDays } from '@/lib/data/types';

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

function DayPositionInput({ dayId, initial }: { dayId: string; initial: number | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial != null ? String(initial) : '');

  async function handleBlur() {
    const parsed = value === '' ? null : Number(value);
    if (parsed === initial) return;
    await run(() => updateTemplateDay(dayId, { day_position: parsed }));
  }

  return (
    <input
      type="number"
      placeholder="Day #"
      title="Day position -- carried onto every program instantiated from this template"
      className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

function DayNotesField({ dayId, initial }: { dayId: string; initial: string | null }) {
  const { run } = useAction();
  const [value, setValue] = useState(initial ?? '');

  async function handleBlur() {
    if (value === (initial ?? '')) return;
    await run(() => updateTemplateDay(dayId, { notes: value || null }));
  }

  return (
    <textarea
      placeholder="Workout notes (optional)"
      rows={2}
      className="mt-2 w-full rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={handleBlur}
    />
  );
}

export function ProgramTemplateManager({
  initialTemplates,
  library,
  groups,
}: {
  initialTemplates: ProgramTemplateWithDays[];
  library: ExerciseLibraryRow[];
  groups: ClientGroupWithMembers[];
}) {
  const confirm = useConfirm();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate } = useAction();
  const { run: runAssignGroup, busy: assigningGroup } = useAction();
  const [assignGroupId, setAssignGroupId] = useState<Record<string, string>>({});
  const { run: runDuplicate } = useAction();
  const [newTemplateName, setNewTemplateName] = useState('');
  const [dayForms, setDayForms] = useState<Record<string, { weekNum: number; dayLabel: string; dayPosition: string }>>({});
  const [dupForms, setDupForms] = useState<Record<string, { sourceWeek: number; totalWeeks: number }>>({});
  const { run: runDuplicateWeek, busy: duplicatingWeek } = useAction();
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [openDayId, setOpenDayId] = useState<string | null>(null);

  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(() => createProgramTemplate(newTemplateName), {
      success: 'Programme template created',
      onDone: () => setNewTemplateName(''),
    });
  }

  async function handleAddDay(templateId: string) {
    const form = dayForms[templateId] ?? { weekNum: 1, dayLabel: 'Day 1', dayPosition: '' };
    const dayPosition = form.dayPosition === '' ? null : Number(form.dayPosition);
    await runMutate(() => addTemplateDay(templateId, form.weekNum, form.dayLabel, dayPosition), { success: 'Day added' });
  }

  // Builds the rest of the block by copying an already-built week's days (with their
  // exercises -- duplicateTemplateDay copies both) into every remaining week, instead of
  // generating blank numbered day shells. day_position carries over unchanged from the source
  // day, so check-in resolution (lib/utils/checkin.ts) still works on any client the template
  // gets instantiated onto, with no per-week retyping.
  async function handleDuplicateWeek(template: ProgramTemplateWithDays) {
    const form = dupForms[template.id] ?? { sourceWeek: 1, totalWeeks: 4 };
    const sourceDays = template.program_template_days.filter((d) => d.week_num === form.sourceWeek);
    if (sourceDays.length === 0) return;
    const inserts: Promise<void>[] = [];
    for (let week = form.sourceWeek + 1; week <= form.totalWeeks; week++) {
      for (const day of sourceDays) {
        inserts.push(duplicateTemplateDay(day.id, week, day.day_label));
      }
    }
    await runDuplicateWeek(() => Promise.all(inserts), {
      success: `Week ${form.sourceWeek} copied through week ${form.totalWeeks}`,
    });
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

  async function handleCopyDay(dayId: string, weekNum: number, dayLabel: string) {
    await runMutate(() => duplicateTemplateDay(dayId, weekNum + 1, dayLabel), { success: 'Workout copied to next week' });
  }

  async function handleDuplicate(templateId: string, name: string) {
    await runDuplicate(() => duplicateProgramTemplate(templateId, `${name} (copy)`), { success: 'Template duplicated' });
  }

  // Loops the same instantiate_program_template RPC (already used for single-client "Start
  // from a programme template" on WorkoutTab.tsx) over every member of the chosen group --
  // no new RPC needed, since instantiating N times is exactly "assign to N clients."
  async function handleAssignGroup(template: ProgramTemplateWithDays) {
    const groupId = assignGroupId[template.id];
    const group = groups.find((g) => g.id === groupId);
    if (!group || group.memberIds.length === 0) return;
    await runAssignGroup(
      async () => {
        const results = await Promise.all(
          group.memberIds.map((clientId) => instantiateProgramTemplate(template.id, clientId, template.name))
        );
        const failed = results.filter((r) => !r.ok).length;
        if (failed > 0) {
          return { ok: false, error: `${failed} of ${results.length} assignments failed` } as const;
        }
        return { ok: true } as const;
      },
      { success: `Assigned to ${group.memberIds.length} client${group.memberIds.length === 1 ? '' : 's'} in "${group.name}"` }
    );
  }

  const openDay = openDayId
    ? initialTemplates.flatMap((t) => t.program_template_days).find((d) => d.id === openDayId)
    : undefined;

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
        <div key={template.id} className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setPreviewId(preview ? null : template.id)}
              className="text-left font-medium text-black hover:underline dark:text-zinc-50"
            >
              {template.name}
            </button>
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={() => handleDuplicate(template.id, template.name)}>
                Duplicate
              </Button>
              <Button variant="danger" size="sm" onClick={() => handleDeleteTemplate(template.id, template.name)}>
                Delete template
              </Button>
            </div>
          </div>

          {!preview && (
            <p className="mt-1 text-xs text-zinc-500">
              {template.program_template_days.length} day{template.program_template_days.length === 1 ? '' : 's'} — click the name to preview and edit.
            </p>
          )}

          {preview && groups.length > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-black/10 p-2.5 dark:border-white/10">
              <span className="text-xs text-zinc-500">Assign to group:</span>
              <select
                className="rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={assignGroupId[template.id] ?? ''}
                onChange={(e) => setAssignGroupId({ ...assignGroupId, [template.id]: e.target.value })}
              >
                <option value="">Choose a group…</option>
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.memberIds.length})
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={assigningGroup || !assignGroupId[template.id]}
                onClick={() => handleAssignGroup(template)}
              >
                {assigningGroup ? 'Assigning…' : 'Assign'}
              </Button>
              <p className="w-full text-xs text-zinc-500">
                Starts this programme for every client in the group at once, same as starting it
                for one client from their Training tab.
              </p>
            </div>
          )}

          {preview && (
            <ProgramDayList
              ownerId={template.id}
              library={library}
              showPhaseLabel={false}
              onOpenDay={setOpenDayId}
              days={template.program_template_days.map((day) => ({
                id: day.id,
                weekNum: day.week_num,
                dayLabel: day.day_label,
                phaseLabel: day.phase_label,
                exerciseCount: day.program_template_exercises.length,
                exerciseLibraryIds: day.program_template_exercises.map((ex) => ex.exercise_library_id),
              }))}
              renderDayControls={(summary: ProgramDaySummary) => {
                const day = template.program_template_days.find((d) => d.id === summary.id)!;
                return (
                  <>
                    <PhaseLabelInput dayId={day.id} initial={day.phase_label} />
                    <DayPositionInput dayId={day.id} initial={day.day_position} />
                    <DropdownMenu
                      triggerLabel="Day actions"
                      items={[
                        { label: 'Copy Workout', onSelect: () => handleCopyDay(day.id, day.week_num, day.day_label) },
                        {
                          label: 'Delete day',
                          onSelect: () => handleDeleteDay(day.id, `Week ${day.week_num} — ${day.day_label}`),
                          destructive: true,
                        },
                      ]}
                    />
                  </>
                );
              }}
            />
          )}

          {preview && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5 rounded-md border border-black/10 p-2.5 dark:border-white/10">
              <span className="text-xs text-zinc-500">Duplicate week</span>
              <input
                type="number"
                min={1}
                title="Which week to copy from"
                className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dupForms[template.id]?.sourceWeek ?? 1}
                onChange={(e) =>
                  setDupForms({
                    ...dupForms,
                    [template.id]: {
                      sourceWeek: Math.max(1, Number(e.target.value) || 1),
                      totalWeeks: dupForms[template.id]?.totalWeeks ?? 4,
                    },
                  })
                }
              />
              <span className="text-xs text-zinc-500">through week</span>
              <input
                type="number"
                min={1}
                title="Total weeks in the block"
                className="w-14 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dupForms[template.id]?.totalWeeks ?? 4}
                onChange={(e) =>
                  setDupForms({
                    ...dupForms,
                    [template.id]: {
                      sourceWeek: dupForms[template.id]?.sourceWeek ?? 1,
                      totalWeeks: Math.max(1, Number(e.target.value) || 1),
                    },
                  })
                }
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={duplicatingWeek}
                onClick={() => handleDuplicateWeek(template)}
              >
                {duplicatingWeek ? 'Duplicating…' : 'Duplicate'}
              </Button>
              <p className="w-full text-xs text-zinc-500">
                Build one week fully, then copy it (with all its exercises) into every remaining
                week of the block.
              </p>
            </div>
          )}

          {preview && (
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <input
                type="number"
                placeholder="Week"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[template.id]?.weekNum ?? 1}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [template.id]: {
                      weekNum: Number(e.target.value),
                      dayLabel: dayForms[template.id]?.dayLabel ?? 'Day 1',
                      dayPosition: dayForms[template.id]?.dayPosition ?? '',
                    },
                  })
                }
              />
              <input
                placeholder="Day label"
                className="w-32 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[template.id]?.dayLabel ?? 'Day 1'}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [template.id]: {
                      weekNum: dayForms[template.id]?.weekNum ?? 1,
                      dayLabel: e.target.value,
                      dayPosition: dayForms[template.id]?.dayPosition ?? '',
                    },
                  })
                }
              />
              <input
                type="number"
                placeholder="Day #"
                title="Day position -- carried onto every program instantiated from this template"
                className="w-16 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
                value={dayForms[template.id]?.dayPosition ?? ''}
                onChange={(e) =>
                  setDayForms({
                    ...dayForms,
                    [template.id]: {
                      weekNum: dayForms[template.id]?.weekNum ?? 1,
                      dayLabel: dayForms[template.id]?.dayLabel ?? 'Day 1',
                      dayPosition: e.target.value,
                    },
                  })
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

      {openDay && (
        <FocusOverlay
          title={openDay.day_label}
          subtitle={`Week ${openDay.week_num}`}
          onClose={() => setOpenDayId(null)}
        >
          <DayNotesField dayId={openDay.id} initial={openDay.notes} />

          <ExerciseEditor
            exercises={openDay.program_template_exercises}
            library={library}
            canEdit
            showProgression
            onAdd={(fields) => addTemplateExercise(openDay.id, fields)}
            onUpdate={(id, fields) => updateTemplateExercise(id, fields)}
            onDelete={(id) => deleteTemplateExercise(id)}
            onReorder={reorderTemplateExercises}
          />
        </FocusOverlay>
      )}
    </div>
  );
}
