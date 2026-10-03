'use client';

import { useRef, useState } from 'react';
import { ChevronRight, ClipboardList, UserPlus } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { RenameWorkoutSheet } from '@/app/_components/workouts/AddWorkoutSheet';
import { EmptyState } from '@/app/_components/EmptyState';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { ExerciseEditor } from '@/app/_components/workouts/ExerciseEditor';
import { FocusOverlay } from '@/app/_components/workouts/FocusOverlay';
import { ProgramDayList, type ProgramDaySummary } from '@/app/_components/workouts/ProgramDayList';
import {
  addTemplateDay,
  addTemplateExercise,
  createProgramTemplateAndGetId,
  deleteTemplateWeek,
  updateProgramTemplate,
  deleteProgramTemplate,
  deleteTemplateDay,
  deleteTemplateExercise,
  duplicateProgramTemplate,
  duplicateTemplateDay,
  importProgramTemplate,
  cancelProgrammeRollout,
  scheduleProgrammeRollout,
  reorderTemplateExercises,
  updateTemplateDay,
  updateTemplateExercise,
  updateTemplateExercises,
} from '@/lib/data/programTemplates';
import { toTemplateExport } from '@/lib/data/templateTransfer';
import { downloadTextFile } from '@/lib/utils/csv';
import { DEFAULT_TIMEZONE, PROGRAM_WEEKDAYS, WEEKDAY_SHORT, todayIsoInTz } from '@/lib/utils/dates';
import type { ClientGroupWithMembers, ExerciseLibraryRow, ProgrammeRolloutRow, ProgramTemplateWithDays } from '@/lib/data/types';

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function exportTemplate(template: ProgramTemplateWithDays) {
  const json = JSON.stringify(toTemplateExport(template), null, 2);
  const slug = template.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
  downloadTextFile(`${slug}.json`, json, 'application/json');
}

function DayOfWeekSelect({ dayId, initial }: { dayId: string; initial: number | null }) {
  const { run } = useAction();

  async function handleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const parsed = e.target.value === '' ? null : Number(e.target.value);
    if (parsed === initial) return;
    await run(() => updateTemplateDay(dayId, { day_position: parsed }));
  }

  return (
    <select
      title="Day of the week -- carried onto every program instantiated from this template"
      className="w-20 shrink-0 rounded-md border border-black/10 bg-transparent px-2 py-1 text-xs dark:border-white/10"
      value={initial ?? ''}
      onChange={handleChange}
    >
      <option value="">Day…</option>
      {PROGRAM_WEEKDAYS.map((d) => (
        <option key={d} value={d}>
          {WEEKDAY_SHORT[d]}
        </option>
      ))}
    </select>
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

function WeekdayChips({ value, onChange }: { value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {PROGRAM_WEEKDAYS.map((d) => (
        <button
          key={d}
          type="button"
          onClick={() => onChange(value === d ? null : d)}
          className={`rounded-full px-3 py-1.5 text-xs font-bold ${
            value === d ? 'bg-accent text-accent-foreground' : 'border border-black/10 text-zinc-600 dark:border-white/15 dark:text-zinc-300'
          }`}
        >
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

// Name + description, saved when you leave the field.
function TemplateDetails({ template }: { template: ProgramTemplateWithDays }) {
  const { run } = useAction();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  return (
    <div className="space-y-2">
      <input
        aria-label="Template name"
        className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm font-bold dark:border-white/10"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          const next = name.trim();
          if (!next) return setName(template.name);
          if (next !== template.name) run(() => updateProgramTemplate(template.id, { name: next }));
        }}
      />
      <textarea
        aria-label="Description"
        rows={2}
        placeholder="Describe it, e.g. 4 weeks, 3 days a week, fat loss, beginner"
        className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onBlur={() => {
          if (description.trim() !== (template.description ?? '')) {
            run(() => updateProgramTemplate(template.id, { description: description.trim() || null }), {
              success: 'Saved',
            });
          }
        }}
      />
    </div>
  );
}

export function ProgramTemplateManager({
  initialTemplates,
  library,
  groups,
  members,
  rollouts,
}: {
  initialTemplates: ProgramTemplateWithDays[];
  library: ExerciseLibraryRow[];
  groups: ClientGroupWithMembers[];
  members: { id: string; name: string }[];
  rollouts: ProgrammeRolloutRow[];
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const { run: runCreate, busy: creating } = useAction();
  const { run: runMutate, busy: mutating } = useAction();
  const { run: runAssign, busy: assigning } = useAction();
  const { run: runDuplicate } = useAction();
  const { run: runImport, busy: importing } = useAction();
  const [newTemplateName, setNewTemplateName] = useState('');
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [openDayId, setOpenDayId] = useState<string | null>(null);
  const [addingTemplate, setAddingTemplate] = useState(false);
  const [activeWeek, setActiveWeek] = useState<number | null>(null);
  const [addWorkout, setAddWorkout] = useState<{ label: string; position: number | null } | null>(null);
  const [renameDay, setRenameDay] = useState<{ id: string; name: string; position: number | null } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignName, setAssignName] = useState('');
  const [assignStart, setAssignStart] = useState('');
  const [assignAudience, setAssignAudience] = useState<'all' | 'selected'>('all');
  const [picked, setPicked] = useState<string[]>([]);
  const [groupId, setGroupId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);

  function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(reader.result ?? ''));
      } catch {
        toast.error('That file isn’t valid JSON');
        return;
      }
      await runImport(() => importProgramTemplate(parsed), { success: 'Programme template imported' });
    };
    reader.readAsText(file);
  }

  function openTemplate(id: string) {
    setActiveWeek(null);
    setPreviewId(id);
  }

  // Creates the template and opens it straight away so the coach can start building.
  async function handleCreateTemplate(e: React.FormEvent) {
    e.preventDefault();
    let newId: string | null = null;
    await runCreate(
      async () => {
        newId = await createProgramTemplateAndGetId(newTemplateName.trim());
      },
      {
        onDone: () => {
          setNewTemplateName('');
          setAddingTemplate(false);
          if (newId) openTemplate(newId);
        },
      }
    );
  }

  async function handleAddWorkout(template: ProgramTemplateWithDays, week: number) {
    if (!addWorkout) return;
    const label = addWorkout.label.trim() || 'Workout';
    await runMutate(() => addTemplateDay(template.id, week, label, addWorkout.position), {
      success: 'Workout added',
      onDone: () => setAddWorkout(null),
    });
  }

  // A new week starts as a copy of the last one (every workout and exercise), so building a block
  // is "make week 1, tap Add week until you have enough", then tweak. An empty template gets a
  // first blank workout instead.
  async function handleAddWeek(template: ProgramTemplateWithDays) {
    const weekNums = template.program_template_days.map((d) => d.week_num);
    if (weekNums.length === 0) {
      await runMutate(() => addTemplateDay(template.id, 1, 'Workout 1'), { onDone: () => setActiveWeek(1) });
      return;
    }
    const last = Math.max(...weekNums);
    const source = template.program_template_days.filter((d) => d.week_num === last);
    await runMutate(() => Promise.all(source.map((d) => duplicateTemplateDay(d.id, last + 1, d.day_label))), {
      success: `Week ${last + 1} added, copied from week ${last}`,
      onDone: () => setActiveWeek(last + 1),
    });
  }

  async function handleDeleteWeek(template: ProgramTemplateWithDays, week: number) {
    const ok = await confirm({
      title: `Delete week ${week}?`,
      body: 'Removes every workout and exercise in this week of the template. Members already on this programme keep their own copy.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteTemplateWeek(template.id, week), {
      success: `Week ${week} deleted`,
      onDone: () => setActiveWeek(null),
    });
  }

  async function handleDeleteTemplate(templateId: string, name: string) {
    const ok = await confirm({
      title: `Delete “${name}”?`,
      body: 'This removes every week, day and exercise in the template. Clients who already started this programme keep their own copy.',
      destructive: true,
    });
    if (!ok) return;
    await runMutate(() => deleteProgramTemplate(templateId), {
      success: 'Template deleted',
      onDone: () => setPreviewId(null),
    });
  }

  async function handleDeleteDay(dayId: string, label: string) {
    const ok = await confirm({ title: `Delete “${label}”?`, body: 'This removes the workout and all its exercises.', destructive: true });
    if (!ok) return;
    await runMutate(() => deleteTemplateDay(dayId), { success: 'Workout deleted' });
  }

  // The same workout repeats every week, so renaming can cover the matching workout in each week.
  async function handleRenameDay(template: ProgramTemplateWithDays, name: string, allWeeks: boolean) {
    if (!renameDay) return;
    const source = renameDay;
    const old = template.program_template_days.find((d) => d.id === source.id);
    const targets = allWeeks && old
      ? template.program_template_days.filter((d) => d.day_label === old.day_label && d.day_position === old.day_position)
      : template.program_template_days.filter((d) => d.id === source.id);
    await runMutate(() => Promise.all(targets.map((d) => updateTemplateDay(d.id, { day_label: name }))), {
      success: 'Renamed',
      onDone: () => setRenameDay(null),
    });
  }

  async function handleCopyDay(dayId: string, weekNum: number, dayLabel: string) {
    await runMutate(() => duplicateTemplateDay(dayId, weekNum + 1, dayLabel), { success: 'Workout copied to next week' });
  }

  async function handleDuplicate(templateId: string, name: string) {
    await runDuplicate(() => duplicateProgramTemplate(templateId, `${name} (copy)`), { success: 'Template duplicated' });
  }

  function openAssign(template: ProgramTemplateWithDays) {
    setAssignName(template.name);
    setAssignStart(todayIsoInTz(DEFAULT_TIMEZONE));
    setAssignAudience('all');
    setPicked([]);
    setGroupId('');
    setMemberSearch('');
    setAssignOpen(true);
  }

  // Gives the programme to each chosen member (and everyone in a chosen group) as their own copy.
  const groupMemberIds = groups.find((g) => g.id === groupId)?.memberIds ?? [];
  const targetIds = assignAudience === 'selected' ? Array.from(new Set([...picked, ...groupMemberIds])) : [];
  const todayIso = todayIsoInTz(DEFAULT_TIMEZONE);
  const startsNow = !assignStart || assignStart <= todayIso;

  async function handleAssign(template: ProgramTemplateWithDays) {
    if (assignAudience === 'selected' && targetIds.length === 0) return;
    await runAssign(
      () =>
        scheduleProgrammeRollout({
          templateId: template.id,
          programName: assignName.trim() || template.name,
          startDate: assignStart || todayIso,
          audience: assignAudience,
          clientIds: targetIds,
          startsNow,
        }),
      {
        success: startsNow ? 'Programme started' : `Scheduled for ${longDate(assignStart)}`,
        onDone: () => setAssignOpen(false),
      }
    );
  }

  const openDay = openDayId
    ? initialTemplates.flatMap((t) => t.program_template_days).find((d) => d.id === openDayId)
    : undefined;
  const previewTemplate = previewId ? initialTemplates.find((t) => t.id === previewId) : undefined;
  const previewWeeks = previewTemplate
    ? Array.from(new Set(previewTemplate.program_template_days.map((d) => d.week_num))).sort((a, b) => a - b)
    : [];
  const shownWeek = activeWeek != null && previewWeeks.includes(activeWeek) ? activeWeek : (previewWeeks[0] ?? 1);
  const shownWeekDays = previewTemplate?.program_template_days.filter((d) => d.week_num === shownWeek) ?? [];
  const filteredMembers = members.filter((m) => m.name.toLowerCase().includes(memberSearch.trim().toLowerCase()));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <input ref={importFileRef} type="file" accept=".json,application/json" className="hidden" onChange={handleImportFile} />
        <button
          type="button"
          onClick={() => setAddingTemplate(true)}
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
        >
          + New template
        </button>
        <DropdownMenu
          variant="header"
          triggerLabel="More template actions"
          items={[{ label: importing ? 'Importing…' : 'Import template', onSelect: () => importFileRef.current?.click(), disabled: importing }]}
        />
      </div>

      {addingTemplate && (
        <form onSubmit={handleCreateTemplate} className="space-y-3 rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Template name</label>
            <input
              required
              autoFocus
              placeholder="e.g. 4 week fat loss, 3 days"
              className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10"
              value={newTemplateName}
              onChange={(e) => setNewTemplateName(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="submit" variant="primary" disabled={creating}>
              {creating ? 'Creating…' : 'Create and start building'}
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAddingTemplate(false)}>
              Cancel
            </Button>
          </div>
        </form>
      )}

      {initialTemplates.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title="No programme templates yet"
          hint="Build one here, then give it to a member or a whole group in one go instead of building each programme from scratch."
        />
      )}

      <div className="space-y-2">
        {initialTemplates.map((template) => {
          const weekNums = Array.from(new Set(template.program_template_days.map((d) => d.week_num)));
          const perWeek = Math.max(0, ...weekNums.map((w) => template.program_template_days.filter((d) => d.week_num === w).length));
          const exercises = template.program_template_days.reduce((n, d) => n + d.program_template_exercises.length, 0);
          return (
            <div
              key={template.id}
              className="flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] bg-card p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
            >
              <button type="button" onClick={() => openTemplate(template.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <div className="min-w-0">
                  <p className="font-bold text-black dark:text-zinc-50">{template.name}</p>
                  {template.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{template.description}</p>
                  )}
                  {rollouts.filter((r) => r.template_id === template.id).slice(0, 1).map((r) => (
                    <p key={r.id} className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                      Starts {longDate(r.start_date)}
                    </p>
                  ))}
                  <p className="mt-0.5 text-xs text-zinc-500">
                    {weekNums.length === 0
                      ? 'Empty, tap to start building'
                      : `${weekNums.length} week${weekNums.length === 1 ? '' : 's'} · ${perWeek} workout${perWeek === 1 ? '' : 's'} a week · ${exercises} exercise${exercises === 1 ? '' : 's'}`}
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-zinc-300 dark:text-zinc-600" />
              </button>
              <div className="ml-auto flex shrink-0 items-center gap-1 text-sm font-semibold">
                <button type="button" onClick={() => openTemplate(template.id)} className="rounded-full px-2.5 py-1 text-accent hover:bg-accent/10">
                  Edit
                </button>
                <DropdownMenu
                  triggerLabel={`More actions for ${template.name}`}
                  items={[
                    { label: 'Duplicate', onSelect: () => handleDuplicate(template.id, template.name) },
                    { label: 'Export as JSON', onSelect: () => exportTemplate(template) },
                    { label: 'Delete template', destructive: true, onSelect: () => handleDeleteTemplate(template.id, template.name) },
                  ]}
                />
              </div>
            </div>
          );
        })}
      </div>

      {previewTemplate && (
        <FocusOverlay title={previewTemplate.name} onClose={() => setPreviewId(null)}>
          <div className="flex items-center gap-2">
            <Button variant="primary" size="sm" className="flex items-center gap-1.5" onClick={() => openAssign(previewTemplate)}>
              <UserPlus className="h-3.5 w-3.5" />
              Start a programme
            </Button>
            <div className="ml-auto">
              <DropdownMenu
                variant="header"
                triggerLabel="Template actions"
                items={[
                  { label: 'Duplicate', onSelect: () => handleDuplicate(previewTemplate.id, previewTemplate.name) },
                  { label: 'Export as JSON', onSelect: () => exportTemplate(previewTemplate) },
                  {
                    label: 'Delete template',
                    destructive: true,
                    onSelect: () => handleDeleteTemplate(previewTemplate.id, previewTemplate.name),
                  },
                ]}
              />
            </div>
          </div>

          {rollouts.filter((r) => r.template_id === previewTemplate.id).length > 0 && (
            <div className="mt-3 space-y-1.5">
              {rollouts
                .filter((r) => r.template_id === previewTemplate.id)
                .map((r) => (
                  <div key={r.id} className="flex items-center gap-2 rounded-xl bg-accent-soft px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 font-semibold text-accent">
                      Starts {longDate(r.start_date)} for {r.audience === 'all' ? 'everyone at the gym' : `${r.client_ids.length} member${r.client_ids.length === 1 ? '' : 's'}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => runMutate(() => cancelProgrammeRollout(r.id), { success: 'Cancelled' })}
                      className="shrink-0 text-xs font-bold text-danger"
                    >
                      Cancel
                    </button>
                  </div>
                ))}
            </div>
          )}

          <div className="mt-3">
            <TemplateDetails key={previewTemplate.id} template={previewTemplate} />
          </div>

          <ProgramDayList
            ownerId={previewTemplate.id}
            library={library}
            showPhaseLabel={false}
            onOpenDay={setOpenDayId}
            activeWeek={shownWeek}
            onChangeWeek={setActiveWeek}
            days={previewTemplate.program_template_days.map((day) => ({
              id: day.id,
              weekNum: day.week_num,
              dayLabel: day.day_label,
              phaseLabel: day.phase_label,
              dayPosition: day.day_position,
              exerciseCount: day.program_template_exercises.length,
              exerciseLibraryIds: day.program_template_exercises.map((ex) => ex.exercise_library_id),
              highlights: day.program_template_exercises.slice(0, 3).map((ex) => ex.name),
            }))}
            renderDayControls={(summary: ProgramDaySummary) => {
              const day = previewTemplate.program_template_days.find((d) => d.id === summary.id)!;
              return (
                <>
                  <DayOfWeekSelect dayId={day.id} initial={day.day_position} />
                  <DropdownMenu
                    triggerLabel="Workout actions"
                    items={[
                      { label: 'Rename', onSelect: () => setRenameDay({ id: day.id, name: day.day_label, position: day.day_position }) },
                      { label: 'Copy to next week', onSelect: () => handleCopyDay(day.id, day.week_num, day.day_label) },
                      {
                        label: 'Delete workout',
                        onSelect: () => handleDeleteDay(day.id, `Week ${day.week_num}: ${day.day_label}`),
                        destructive: true,
                      },
                    ]}
                  />
                </>
              );
            }}
          />

          {previewWeeks.length === 0 && (
            <p className="mt-4 rounded-2xl border border-dashed border-black/10 p-4 text-sm text-zinc-500 dark:border-white/15">
              Nothing here yet. Add the first workout, fill in its exercises, then use Add week to copy it forward.
            </p>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {previewWeeks.length > 0 && (
              <button
                type="button"
                onClick={() => setAddWorkout({ label: `Workout ${shownWeekDays.length + 1}`, position: null })}
                className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground"
              >
                + Add workout
              </button>
            )}
            <button
              type="button"
              disabled={mutating}
              onClick={() => handleAddWeek(previewTemplate)}
              className={
                previewWeeks.length === 0
                  ? 'rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground disabled:opacity-40'
                  : 'rounded-full border border-black/10 px-4 py-2 text-sm font-bold text-zinc-700 disabled:opacity-40 dark:border-white/15 dark:text-zinc-200'
              }
            >
              {previewWeeks.length === 0 ? '+ Add first workout' : '+ Add week (copy of last)'}
            </button>
            {previewWeeks.length > 1 && (
              <button
                type="button"
                onClick={() => handleDeleteWeek(previewTemplate, shownWeek)}
                className="rounded-full px-3 py-2 text-sm font-semibold text-danger hover:bg-danger/10"
              >
                Delete week {shownWeek}
              </button>
            )}
          </div>

          {renameDay && (
            <RenameWorkoutSheet
              initial={renameDay.name}
              otherWeeks={
                previewTemplate.program_template_days.filter(
                  (d) => d.id !== renameDay.id && d.day_label === renameDay.name && d.day_position === renameDay.position
                ).length
              }
              busy={mutating}
              onSubmit={(name, allWeeks) => handleRenameDay(previewTemplate, name, allWeeks)}
              onClose={() => setRenameDay(null)}
            />
          )}

          {addWorkout && (
            <BottomSheet title={`Add a workout to week ${shownWeek}`} onClose={() => setAddWorkout(null)}>
              <div className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Name</label>
                  <input
                    autoFocus
                    className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-sm dark:border-white/10"
                    value={addWorkout.label}
                    onChange={(e) => setAddWorkout({ ...addWorkout, label: e.target.value })}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500">Day of the week (optional)</label>
                  <WeekdayChips value={addWorkout.position} onChange={(v) => setAddWorkout({ ...addWorkout, position: v })} />
                </div>
                <Button variant="primary" className="w-full" disabled={mutating} onClick={() => handleAddWorkout(previewTemplate, shownWeek)}>
                  {mutating ? 'Adding…' : 'Add workout'}
                </Button>
              </div>
            </BottomSheet>
          )}

          {assignOpen && (
            <BottomSheet title="Start this programme" onClose={() => setAssignOpen(false)}>
              <div className="space-y-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Each member gets their own copy on the start date and it becomes the programme they follow. Their old programmes and
                  every weight and rep logged stay on file. Edit this template any time before the start date and the copies pick up the
                  changes.
                </p>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Starts</label>
                  <input
                    type="date"
                    min={todayIso}
                    className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
                    value={assignStart}
                    onChange={(e) => setAssignStart(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-zinc-500">Programme name for them</label>
                  <input
                    className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2.5 text-base dark:border-white/10"
                    value={assignName}
                    onChange={(e) => setAssignName(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-zinc-500">Who gets it</label>
                  <div className="flex gap-2">
                    {(['all', 'selected'] as const).map((a) => (
                      <button
                        key={a}
                        type="button"
                        onClick={() => setAssignAudience(a)}
                        className={`rounded-full px-3.5 py-1.5 text-xs font-bold ${
                          assignAudience === a ? 'bg-accent text-accent-foreground' : 'border border-black/10 dark:border-white/15'
                        }`}
                      >
                        {a === 'all' ? 'Everyone at the gym' : 'Choose members'}
                      </button>
                    ))}
                  </div>
                </div>
                {assignAudience === 'selected' && (
                  <>
                    {groups.length > 0 && (
                      <div className="space-y-1">
                        <label className="text-xs font-medium text-zinc-500">A whole group</label>
                        <select
                          className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10"
                          value={groupId}
                          onChange={(e) => setGroupId(e.target.value)}
                        >
                          <option value="">No group</option>
                          {groups.map((g) => (
                            <option key={g.id} value={g.id}>
                              {g.name} ({g.memberIds.length})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <label className="text-xs font-medium text-zinc-500">Members</label>
                      <input
                        placeholder="Search your members"
                        className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-base dark:border-white/10"
                        value={memberSearch}
                        onChange={(e) => setMemberSearch(e.target.value)}
                      />
                      <div className="max-h-56 divide-y divide-black/5 overflow-y-auto rounded-xl border border-black/10 dark:divide-white/10 dark:border-white/10">
                        {filteredMembers.length === 0 && <p className="p-3 text-sm text-zinc-500">No members found.</p>}
                        {filteredMembers.map((m) => {
                          const inGroup = groupMemberIds.includes(m.id);
                          return (
                            <label key={m.id} className="flex cursor-pointer items-center gap-3 px-3 py-2.5 text-sm">
                              <input
                                type="checkbox"
                                checked={picked.includes(m.id) || inGroup}
                                disabled={inGroup}
                                onChange={() => setPicked(picked.includes(m.id) ? picked.filter((x) => x !== m.id) : [...picked, m.id])}
                              />
                              <span className="font-medium text-black dark:text-zinc-50">{m.name}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={assigning || (assignAudience === 'selected' && targetIds.length === 0)}
                  onClick={() => handleAssign(previewTemplate)}
                >
                  {assigning
                    ? 'Saving…'
                    : assignAudience === 'selected' && targetIds.length === 0
                      ? 'Choose who gets it'
                      : startsNow
                        ? assignAudience === 'all'
                          ? 'Start for everyone today'
                          : `Start for ${targetIds.length} member${targetIds.length === 1 ? '' : 's'} today`
                        : assignAudience === 'all'
                          ? `Schedule for everyone on ${longDate(assignStart)}`
                          : `Schedule for ${targetIds.length} member${targetIds.length === 1 ? '' : 's'} on ${longDate(assignStart)}`}
                </Button>
              </div>
            </BottomSheet>
          )}
        </FocusOverlay>
      )}

      {openDay && (
        <FocusOverlay title={openDay.day_label} subtitle={`Week ${openDay.week_num}`} onClose={() => setOpenDayId(null)}>
          <DayNotesField dayId={openDay.id} initial={openDay.notes} />

          <ExerciseEditor
            exercises={openDay.program_template_exercises}
            library={library}
            canEdit
            showProgression
            onAdd={(fields) => addTemplateExercise(openDay.id, fields)}
            onUpdate={(id, fields) => updateTemplateExercise(id, fields)}
            onUpdateMany={(ids, fields) => updateTemplateExercises(ids, fields)}
            onDelete={(id) => deleteTemplateExercise(id)}
            onReorder={reorderTemplateExercises}
          />
        </FocusOverlay>
      )}
    </div>
  );
}
