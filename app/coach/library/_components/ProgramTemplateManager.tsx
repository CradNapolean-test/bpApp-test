'use client';

import { useEffect, useRef, useState } from 'react';
import { ClipboardList, UserPlus } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useLenis } from 'lenis/react';
import { flashWeek, showWeekRow } from '@/app/_components/motion/programWeeks';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { sameWorkoutInWeek } from '@/lib/utils/programmeDays';
import { dayHighlights } from '@/lib/workoutSections';
import { useActiveGymId, useCoachGyms } from '@/app/coach/_components/CoachGymsContext';
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
  addTemplateWeek,
  importProgramTemplate,
  cancelProgrammeRollout,
  scheduleProgrammeRollout,
  getGymMemberCount,
  getRolloutUsage,
  previewTemplateToRollout,
  applyTemplateToRollout,
  type RolloutUsageRow,
  getGymProgrammes,
  changeGymProgramme,
  resolveGymProgrammeWaiting,
  reorderTemplateExercises,
  updateTemplateDay,
  updateTemplateExercise,
  updateTemplateExercises,
} from '@/lib/data/programTemplates';
import { toTemplateExport } from '@/lib/data/templateTransfer';
import { downloadTextFile } from '@/lib/utils/csv';
import { DEFAULT_ROLLOUT_AUDIENCE, membersLabel, rolloutButtonLabel, rolloutConfirmation, rolloutSuccessMessage, type RolloutPlan } from '@/lib/rolloutPlan';
import { NOTHING_TO_UPDATE, rolloutUpdateConfirmation, rolloutUpdateDone, templateInUseLabel } from '@/lib/rolloutUpdate';
import {
  MAX_GYM_PROGRAMME_WEEKS,
  MIN_GYM_PROGRAMME_WEEKS,
  builtWeeksNote,
  changeLengthConfirmation,
  defaultGymProgrammeWeeks,
  deleteTemplateConfirmation,
  deleteTemplateRefusal,
  endGymProgrammeConfirmation,
  followOnLabel,
  followOnStart,
  giveWaitingConfirmation,
  gymProgrammeLabel,
  gymProgrammeRunsLabel,
  gymProgrammeSpans,
  gymProgrammeStatus,
  overlapNote,
  waitingCountLabel,
  waitingDone,
  waitingHeading,
  waitingReason,
  weeksLabel,
  type GymProgramme,
  type GymProgrammeWaiting,
} from '@/lib/gymProgramme';
import { DEFAULT_TIMEZONE, PROGRAM_WEEKDAYS, WEEKDAY_SHORT, todayIsoInTz } from '@/lib/utils/dates';
import type { ClientGroupWithMembers, ExerciseLibraryRow, ProgrammeRolloutRow, ProgramTemplateWithDays } from '@/lib/data/types';

// How many weeks a template has built: its last week's number (weeks are kept without gaps, deleteTemplateWeek).
const builtWeeks = (template: ProgramTemplateWithDays) => Math.max(0, ...template.program_template_days.map((d) => d.week_num));

const longDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });

function exportTemplate(template: ProgramTemplateWithDays) {
  const json = JSON.stringify(toTemplateExport(template), null, 2);
  const slug = template.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'template';
  downloadTextFile(`${slug}.json`, json, 'application/json');
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
      className="mt-2 w-full rounded-lg border border-black/[.16] bg-transparent px-2 py-1 text-xs dark:border-white/10"
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
          aria-pressed={value === d}
          onClick={() => onChange(value === d ? null : d)}
          className={`h-11 min-w-11 rounded-xl px-3 text-sm font-bold ${
            value === d ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
          }`}
        >
          {WEEKDAY_SHORT[d]}
        </button>
      ))}
    </div>
  );
}

// Name + description, saved when you leave the field. Each says when it has saved, or that it could not (LB15: the name saved silently).
function TemplateDetails({ template }: { template: ProgramTemplateWithDays }) {
  const { run } = useAction();
  const [name, setName] = useState(template.name);
  const [description, setDescription] = useState(template.description ?? '');
  const [saveState, setSaveState] = useState<{ field: 'name' | 'description'; state: 'saving' | 'saved' | 'failed' } | null>(null);

  async function save(field: 'name' | 'description', fields: { name?: string; description?: string | null }) {
    setSaveState({ field, state: 'saving' });
    const saved = await run(() => updateProgramTemplate(template.id, fields), {
      success: field === 'name' ? 'Name saved' : 'Description saved',
    });
    setSaveState({ field, state: saved ? 'saved' : 'failed' });
  }

  const note = (field: 'name' | 'description') =>
    saveState?.field === field ? (
      <p role="status" className={`text-xs font-semibold ${saveState.state === 'failed' ? 'text-danger' : 'text-zinc-500'}`}>
        {saveState.state === 'saving' ? 'Saving…' : saveState.state === 'saved' ? 'Saved' : 'Not saved. Try again, or check your connection.'}
      </p>
    ) : null;

  return (
    <div className="space-y-2">
      <input
        aria-label="Template name"
        className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm font-bold dark:border-white/10"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          if (saveState?.field === 'name') setSaveState(null);
        }}
        onBlur={() => {
          const next = name.trim();
          if (!next) return setName(template.name);
          if (next !== template.name) void save('name', { name: next });
        }}
      />
      {note('name')}
      <textarea
        aria-label="Description"
        rows={2}
        placeholder="Describe it, e.g. 4 weeks, 3 days a week, fat loss, beginner"
        className="w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10"
        value={description}
        onChange={(e) => {
          setDescription(e.target.value);
          if (saveState?.field === 'description') setSaveState(null);
        }}
        onBlur={() => {
          if (description.trim() !== (template.description ?? '')) void save('description', { description: description.trim() || null });
        }}
      />
      {note('description')}
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
  const lenis = useLenis();
  const gymId = useActiveGymId();
  // Only a gym admin can cancel, end or change a programme for everyone at the gym (checked in the database too). Shown when the coach's
  // gyms could not be loaded, so an admin is never left without the buttons; the database refuses anyone else.
  const isGymAdmin = useCoachGyms().find((g) => g.isActive)?.isGymAdmin !== false;
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
  const [changeDay, setChangeDay] = useState<{ id: string; label: string; position: number | null } | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const [assignName, setAssignName] = useState('');
  const [assignStart, setAssignStart] = useState('');
  // Choosing members is the default: "everyone" replaces every member's programme, so it is a deliberate choice (R5).
  const [assignAudience, setAssignAudience] = useState<'all' | 'selected'>(DEFAULT_ROLLOUT_AUDIENCE);
  // Everyone at the gym: how many weeks it runs (fixed from its start, migration 0172), and whether the coach has picked the start date
  // (until then it follows on from the gym programme running or scheduled).
  const [assignWeeks, setAssignWeeks] = useState(1);
  const [assignStartPicked, setAssignStartPicked] = useState(false);
  // A gym admin changing the gym programme's length on the template.
  const [lengthDraft, setLengthDraft] = useState<{ rolloutId: string; weeks: number } | null>(null);
  const [gymMemberCount, setGymMemberCount] = useState<number | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [groupId, setGroupId] = useState('');
  const [memberSearch, setMemberSearch] = useState('');
  const importFileRef = useRef<HTMLInputElement>(null);
  // D8: the rollouts members are still on, for "In use by N members" and "Apply to everyone on this rollout". Read again after the page
  // refreshes (a programme started or a template changed) and after applying.
  const [usage, setUsage] = useState<RolloutUsageRow[]>([]);
  // Item 7: the programme the gym is on ("Gym programme: Salford Quays · Mon 9 Nov - Sun 29 Nov (3 weeks) · 16 members"), read with the
  // usage.
  const [gymProgrammes, setGymProgrammes] = useState<GymProgramme[]>([]);
  const [usageVersion, setUsageVersion] = useState(0);
  useEffect(() => {
    let live = true;
    getRolloutUsage()
      .then((rows) => {
        if (live) setUsage(rows);
      })
      .catch(() => {});
    getGymProgrammes()
      .then((rows) => {
        if (live) setGymProgrammes(rows);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [initialTemplates, usageVersion]);

  // Members who join the gym from now on stop getting it, after a confirm. The members on it keep it.
  async function handleEndGymProgramme(g: GymProgramme) {
    if (!(await confirm({ ...endGymProgrammeConfirmation(g), destructive: true }))) return;
    await runMutate(() => changeGymProgramme({ rolloutId: g.rolloutId, weeks: null, end: true, expectedGymId: gymId }), {
      success: 'Gym programme ended',
      onDone: () => setUsageVersion((v) => v + 1),
    });
  }

  // A gym admin gives the gym programme a new length, after a confirm with its new dates (or that it ends today).
  async function handleChangeLength(g: GymProgramme, weeks: number) {
    const { endsToday, ...confirmation } = changeLengthConfirmation(g, weeks);
    if (!(await confirm({ ...confirmation, destructive: endsToday }))) return;
    let outcome: 'ended' | 'changed' = 'changed';
    await runMutate(
      async () => {
        const result = await changeGymProgramme({ rolloutId: g.rolloutId, weeks, end: false, expectedGymId: gymId });
        if (result.ok) outcome = result.outcome;
        return result;
      },
      {
        onDone: () => {
          toast.success(outcome === 'ended' ? 'Gym programme ended' : `Gym programme is now ${weeksLabel(weeks)}`);
          setLengthDraft(null);
          setUsageVersion((v) => v + 1);
        },
      }
    );
  }

  // A member it wasn't given to when they joined (their own programme runs over the same dates): give it to them, or keep theirs.
  async function handleWaiting(g: GymProgramme, w: GymProgrammeWaiting, give: boolean) {
    if (give && !(await confirm(giveWaitingConfirmation(g, w)))) return;
    let message = '';
    await runMutate(
      async () => {
        const result = await resolveGymProgrammeWaiting({ rolloutId: g.rolloutId, clientId: w.clientId, give, expectedGymId: gymId });
        if (result.ok) message = waitingDone(result.outcome, w.name);
        return result;
      },
      {
        onDone: () => {
          toast.success(message);
          setUsageVersion((v) => v + 1);
        },
      }
    );
  }

  // Copies the template into everyone's copy on a rollout for the weeks they haven't reached yet, after a confirm naming how many members.
  async function handleApplyToRollout(r: RolloutUsageRow) {
    const preview = await previewTemplateToRollout(r.rolloutId);
    if (!preview.ok) {
      toast.error(preview.error);
      return;
    }
    const confirmation = rolloutUpdateConfirmation(r.programName, preview.counts);
    if (!confirmation) {
      toast.success(NOTHING_TO_UPDATE);
      return;
    }
    if (!(await confirm({ ...confirmation, destructive: true }))) return;
    let message = '';
    await runMutate(
      async () => {
        const result = await applyTemplateToRollout(r.rolloutId, gymId);
        if (result.ok) message = rolloutUpdateDone(result.counts);
        return result;
      },
      {
        onDone: () => {
          toast.success(message);
          setUsageVersion((v) => v + 1);
        },
      }
    );
  }

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
      await runImport(() => importProgramTemplate(parsed, gymId), { success: 'Programme template imported' });
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
        const created = await createProgramTemplateAndGetId(newTemplateName.trim(), gymId);
        if (created.ok) newId = created.id;
        return created;
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
    if (template.program_template_days.length === 0) {
      await runMutate(() => addTemplateDay(template.id, 1, 'Workout 1'), { onDone: () => setActiveWeek(1) });
      return;
    }
    // Which week is last is read on the server (addTemplateWeek), not from this screen: the button comes back before the page has
    // reloaded, and a second tap used to copy week 1 into week 2 again.
    let added: { from: number; to: number } | null = null;
    await runMutate(
      async () => {
        added = await addTemplateWeek(template.id);
      },
      {
        onDone: () => {
          if (!added) return;
          toast.success(`Week ${added.to} added, copied from week ${added.from}`);
          setActiveWeek(added.to);
          showWeekRow(template.id, lenis);
        },
      }
    );
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

  // Its rollouts go with it, so the gym programme or a start for everyone is a gym admin's to delete (refused in the database too).
  async function handleDeleteTemplate(templateId: string, name: string) {
    const gym = gymProgrammes.find((g) => g.templateId === templateId);
    const scheduled = rollouts.filter((r) => r.template_id === templateId);
    const refusal = isGymAdmin ? null : deleteTemplateRefusal(gym, scheduled);
    if (refusal) {
      toast.error(refusal);
      return;
    }
    const ok = await confirm({ ...deleteTemplateConfirmation(name, gym, scheduled), destructive: true });
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

  // Copying onto a week that already has this workout replaces it (LB3): it used to add a second one, so after "Add week" the next week
  // had two Mondays.
  async function handleCopyDay(template: ProgramTemplateWithDays, day: ProgramTemplateWithDays['program_template_days'][number]) {
    const next = day.week_num + 1;
    const existing = sameWorkoutInWeek(template.program_template_days, day, next);
    if (existing.length > 0) {
      const ok = await confirm({
        title: `Replace week ${next}’s ${existing[0].day_label}?`,
        body: `Week ${next} already has this workout. Copying replaces it and its exercises with week ${day.week_num}’s.`,
        confirmLabel: 'Replace it',
        destructive: true,
      });
      if (!ok) return;
    }
    await runMutate(
      async () => {
        await duplicateTemplateDay(day.id, next, day.day_label);
        for (const old of existing) await deleteTemplateDay(old.id);
      },
      {
        success: existing.length > 0 ? `Week ${next}’s workout replaced` : 'Workout copied to next week',
        onDone: () => flashWeek(template.id, next),
      }
    );
  }

  async function handleDuplicate(templateId: string, name: string) {
    await runDuplicate(() => duplicateProgramTemplate(templateId, `${name} (copy)`, gymId), { success: 'Template duplicated' });
  }

  function openAssign(template: ProgramTemplateWithDays) {
    setAssignName(template.name);
    setAssignStart(todayIsoInTz(DEFAULT_TIMEZONE));
    setAssignAudience(DEFAULT_ROLLOUT_AUDIENCE);
    setAssignWeeks(defaultGymProgrammeWeeks(builtWeeks(template)));
    setAssignStartPicked(false);
    setGymMemberCount(null);
    getGymMemberCount()
      .then(setGymMemberCount)
      .catch(() => setGymMemberCount(null));
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
  // Everyone at the gym: the gym programme running and the starts for everyone scheduled, so the next block follows on from the last one
  // (owner, 21 Nov 2026: 4, 4 and 3-week blocks, then peak week) and an overlap is said.
  const gymSpans = gymProgrammeSpans(
    gymProgrammes.find((g) => g.isOpen),
    rollouts
  );
  const followOn = followOnStart(gymSpans, todayIso);
  const assignRuns = assignAudience === 'all' ? gymProgrammeRunsLabel(assignStart || todayIso, assignWeeks) : null;
  const assignOverlap = assignAudience === 'all' ? overlapNote(assignStart || todayIso, assignWeeks, gymSpans) : null;

  // Choosing everyone starts it the day after the gym programme running or scheduled ends, until the coach picks a date themselves.
  function chooseAudience(a: 'all' | 'selected') {
    setAssignAudience(a);
    if (!assignStartPicked) setAssignStart(a === 'all' && followOn ? followOn.startDate : todayIso);
  }

  const rolloutPlan: RolloutPlan = {
    audience: assignAudience,
    memberCount: assignAudience === 'all' ? gymMemberCount : targetIds.length,
    startsNow,
    startLabel: assignStart ? longDate(assignStart) : 'today',
    runsLabel: assignRuns,
  };

  async function handleAssign(template: ProgramTemplateWithDays) {
    if (assignAudience === 'selected' && targetIds.length === 0) return;
    const confirmation = rolloutConfirmation(rolloutPlan);
    if (confirmation && !(await confirm({ ...confirmation, destructive: true }))) return;
    let reached = 0;
    await runAssign(
      async () => {
        const result = await scheduleProgrammeRollout({
          templateId: template.id,
          programName: assignName.trim() || template.name,
          startDate: assignStart || todayIso,
          audience: assignAudience,
          clientIds: targetIds,
          startsNow,
          weeks: assignAudience === 'all' ? assignWeeks : null,
          expectedGymId: gymId,
        });
        if (result.ok) reached = result.count;
        return result;
      },
      {
        onDone: () => {
          toast.success(rolloutSuccessMessage(rolloutPlan, reached));
          setAssignOpen(false);
        },
      }
    );
  }

  const openDay = openDayId
    ? initialTemplates.flatMap((t) => t.program_template_days).find((d) => d.id === openDayId)
    : undefined;
  const previewTemplate = previewId ? initialTemplates.find((t) => t.id === previewId) : undefined;
  // The gym programme gets its own panel (with its own Apply), so the "In use by" rows are the template's other rollouts.
  const previewGymProgramme = previewTemplate ? gymProgrammes.find((g) => g.templateId === previewTemplate.id) : undefined;
  const previewUsage = previewTemplate
    ? usage.filter((u) => u.templateId === previewTemplate.id && u.rolloutId !== previewGymProgramme?.rolloutId)
    : [];
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
          className="inline-flex h-11 shrink-0 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground hover:opacity-90"
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
        <form onSubmit={handleCreateTemplate} className="space-y-3 rounded-[20px] border border-black/[.08] bg-card p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-[13px] font-bold text-zinc-700 dark:text-zinc-300">Template name</label>
            <input
              required
              autoFocus
              placeholder="e.g. 4 week fat loss, 3 days"
              className="h-11 w-full rounded-xl border border-black/[.16] bg-card px-3.5 text-[15px] dark:border-white/15"
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

      <div className={initialTemplates.length > 0 ? 'overflow-hidden rounded-[20px] border border-black/[.08] bg-card dark:border-white/10' : ''}>
        {initialTemplates.length > 0 && (
          <div className="flex flex-wrap items-baseline justify-between gap-3 px-5 pb-3.5 pt-[18px] sm:px-6">
            <h2 className="text-lg font-extrabold text-black dark:text-zinc-50">Your templates</h2>
            <span className="text-[13px] font-semibold text-zinc-500">
              {initialTemplates.length} template{initialTemplates.length === 1 ? '' : 's'}
            </span>
          </div>
        )}
        {initialTemplates.map((template) => {
          const weekNums = Array.from(new Set(template.program_template_days.map((d) => d.week_num)));
          const perWeek = Math.max(0, ...weekNums.map((w) => template.program_template_days.filter((d) => d.week_num === w).length));
          const exercises = template.program_template_days.reduce((n, d) => n + d.program_template_exercises.length, 0);
          const gymProgramme = gymProgrammes.find((g) => g.templateId === template.id);
          // The gym programme's members are on its own line, so "In use by" counts the template's other rollouts.
          const inUse = templateInUseLabel(usage.filter((u) => u.templateId === template.id && u.rolloutId !== gymProgramme?.rolloutId));
          return (
            <div
              key={template.id}
              data-stagger
              className="flex min-h-[72px] flex-wrap items-center justify-between gap-2.5 border-t border-black/[.07] px-5 py-3 hover:bg-black/[.02] sm:px-6 dark:border-white/10 dark:hover:bg-white/[.03]"
            >
              <button type="button" onClick={() => openTemplate(template.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <div className="min-w-0">
                  <p className="text-[15px] font-bold text-black dark:text-zinc-50">{template.name}</p>
                  {template.description && (
                    <p className="mt-0.5 line-clamp-2 text-sm text-zinc-600 dark:text-zinc-400">{template.description}</p>
                  )}
                  {gymProgramme && (
                    <p className="mt-1 mr-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                      {gymProgrammeLabel(gymProgramme)}
                      {!gymProgramme.isOpen && ' · ended'}
                    </p>
                  )}
                  {gymProgramme && builtWeeksNote(gymProgramme.weeks, builtWeeks(template)) && (
                    <p className="mt-1 mr-1 inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">
                      {builtWeeksNote(gymProgramme.weeks, builtWeeks(template))}
                    </p>
                  )}
                  {gymProgramme && waitingCountLabel(gymProgramme) && (
                    <p className="mt-1 mr-1 inline-block rounded-full bg-warning/15 px-2 py-0.5 text-[11px] font-bold text-warning">
                      {waitingCountLabel(gymProgramme)}
                    </p>
                  )}
                  {inUse && (
                    <p className="mt-1 mr-1 inline-block rounded-full bg-black/5 px-2 py-0.5 text-[11px] font-bold text-zinc-600 dark:bg-white/10 dark:text-zinc-300">
                      {inUse}
                    </p>
                  )}
                  {rollouts.filter((r) => r.template_id === template.id).slice(0, 1).map((r) => (
                    <p key={r.id} className="mt-1 inline-block rounded-full bg-accent-soft px-2 py-0.5 text-[11px] font-bold text-accent">
                      Starts {longDate(r.start_date)}
                    </p>
                  ))}
                  <p className="mt-0.5 text-[13px] text-zinc-500 dark:text-zinc-400">
                    {weekNums.length === 0
                      ? 'Empty, tap to start building'
                      : `${weekNums.length} week${weekNums.length === 1 ? '' : 's'} · ${perWeek} workout${perWeek === 1 ? '' : 's'} a week · ${exercises} exercise${exercises === 1 ? '' : 's'}`}
                  </p>
                </div>
              </button>
              {/* One menu (CV13: a chevron, Edit and a menu each opened or acted on the template); the row itself opens it. */}
              <div className="ml-auto flex shrink-0 items-center text-sm font-semibold">
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
                      {r.audience === 'all' && r.weeks ? (
                        <span className="block text-xs font-medium">
                          {gymProgrammeRunsLabel(r.start_date, r.weeks)}
                          {builtWeeksNote(r.weeks, builtWeeks(previewTemplate)) ? ` · ${builtWeeksNote(r.weeks, builtWeeks(previewTemplate))}` : ''}
                        </span>
                      ) : null}
                    </span>
                    {(r.audience !== 'all' || isGymAdmin) && (
                      <button
                        type="button"
                        onClick={async () => {
                          // It went on one tap (LB2).
                          const ok = await confirm({
                            title: `Stop “${r.program_name}” starting on ${longDate(r.start_date)}?`,
                            body: `It is scheduled for ${r.audience === 'all' ? 'everyone at the gym' : `${r.client_ids.length} member${r.client_ids.length === 1 ? '' : 's'}`}. Nobody has it yet, so nothing else changes, and you can schedule it again.`,
                            confirmLabel: 'Stop it starting',
                            destructive: true,
                          });
                          if (ok) await runMutate(() => cancelProgrammeRollout(r.id), { success: 'Scheduled start cancelled' });
                        }}
                        className="shrink-0 text-xs font-bold text-danger"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ))}
            </div>
          )}

          {previewGymProgramme && (
            <div className="mt-3 space-y-2 rounded-xl border border-accent/30 px-3 py-2.5 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-black dark:text-zinc-50">{gymProgrammeLabel(previewGymProgramme)}</span>
                  <span className="block text-xs text-zinc-500">
                    {gymProgrammeStatus(previewGymProgramme)}
                    {previewGymProgramme.programName !== previewTemplate.name ? ` Given as “${previewGymProgramme.programName}”.` : ''}
                  </span>
                  {builtWeeksNote(previewGymProgramme.weeks, builtWeeks(previewTemplate)) && (
                    <span className="block text-xs font-semibold text-warning">
                      Template: {builtWeeksNote(previewGymProgramme.weeks, builtWeeks(previewTemplate))}
                    </span>
                  )}
                </span>
                {/* A gym admin only, as the database checks: anyone else would only be refused. */}
                {isGymAdmin && previewGymProgramme.members > 0 && (
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() =>
                      handleApplyToRollout({
                        rolloutId: previewGymProgramme.rolloutId,
                        templateId: previewGymProgramme.templateId,
                        programName: previewGymProgramme.programName,
                        startDate: previewGymProgramme.startDate,
                        audience: 'all',
                        members: previewGymProgramme.members,
                      })
                    }
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    Apply to everyone on it
                  </button>
                )}
                {isGymAdmin && previewGymProgramme.isOpen && (
                  <button
                    type="button"
                    disabled={mutating}
                    onClick={() => handleEndGymProgramme(previewGymProgramme)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-danger hover:bg-danger/10 disabled:opacity-50"
                  >
                    End gym programme
                  </button>
                )}
              </div>
              {/* Its length is fixed from its start: only a gym admin changes it (checked in the database too). */}
              {isGymAdmin && previewGymProgramme.isOpen && (
                <div className="flex flex-wrap items-center gap-2 border-t border-black/10 pt-2 dark:border-white/10">
                  <label htmlFor="gym-programme-length" className="text-xs font-medium text-zinc-500">
                    Length
                  </label>
                  <select
                    id="gym-programme-length"
                    className="rounded-xl border border-black/10 bg-transparent px-2.5 py-1.5 text-sm dark:border-white/10"
                    value={lengthDraft?.rolloutId === previewGymProgramme.rolloutId ? lengthDraft.weeks : previewGymProgramme.weeks}
                    onChange={(e) => setLengthDraft({ rolloutId: previewGymProgramme.rolloutId, weeks: Number(e.target.value) })}
                  >
                    {Array.from({ length: MAX_GYM_PROGRAMME_WEEKS - MIN_GYM_PROGRAMME_WEEKS + 1 }, (_, i) => i + MIN_GYM_PROGRAMME_WEEKS).map((n) => (
                      <option key={n} value={n}>
                        {weeksLabel(n)}
                      </option>
                    ))}
                  </select>
                  {lengthDraft?.rolloutId === previewGymProgramme.rolloutId && lengthDraft.weeks !== previewGymProgramme.weeks && (
                    <button
                      type="button"
                      disabled={mutating}
                      onClick={() => handleChangeLength(previewGymProgramme, lengthDraft.weeks)}
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      Change length
                    </button>
                  )}
                </div>
              )}
              {previewGymProgramme.isOpen && previewGymProgramme.waiting.length > 0 && (
                <div className="space-y-1.5 border-t border-black/10 pt-2 dark:border-white/10">
                  <p className="text-xs font-bold text-zinc-600 dark:text-zinc-300">{waitingHeading(previewGymProgramme)}</p>
                  {previewGymProgramme.waiting.map((w) => (
                    <div key={w.clientId} className="flex flex-wrap items-center gap-2">
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold text-black dark:text-zinc-50">{w.name}</span>
                        <span className="block text-xs text-zinc-500">{waitingReason(previewGymProgramme, w)}</span>
                      </span>
                      <button
                        type="button"
                        disabled={mutating}
                        onClick={() => handleWaiting(previewGymProgramme, w, true)}
                        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                      >
                        Give it to them
                      </button>
                      <button
                        type="button"
                        disabled={mutating}
                        onClick={() => handleWaiting(previewGymProgramme, w, false)}
                        className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-zinc-600 hover:bg-black/5 disabled:opacity-50 dark:text-zinc-300 dark:hover:bg-white/10"
                      >
                        Keep theirs
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {previewUsage.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {previewUsage.map((u) => (
                <div key={u.rolloutId} className="flex flex-wrap items-center gap-2 rounded-xl border border-black/10 px-3 py-2 text-sm dark:border-white/10">
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold text-black dark:text-zinc-50">In use by {membersLabel(u.members)}</span>
                    <span className="block text-xs text-zinc-500">
                      Started {longDate(u.startDate)} for {u.audience === 'all' ? 'everyone at the gym' : 'chosen members'}
                      {u.programName !== previewTemplate.name ? ` as “${u.programName}”` : ''}
                    </span>
                  </span>
                  {(u.audience !== 'all' || isGymAdmin) && (
                    <button
                      type="button"
                      disabled={mutating}
                      onClick={() => handleApplyToRollout(u)}
                      className="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/10 disabled:opacity-50"
                    >
                      Apply to everyone on this rollout
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
          {(previewUsage.length > 0 || (previewGymProgramme?.members ?? 0) > 0) && (
            <p className="mt-1.5 text-xs text-zinc-500">
              Changes you make here reach members only when you apply them, and only for weeks they haven’t reached yet. Members given this
              programme one at a time keep their own copy.
            </p>
          )}

          <div className="mt-3">
            <TemplateDetails key={previewTemplate.id} template={previewTemplate} />
          </div>

          <ProgramDayList
            columns
            weekdayOnce
            animateWeeks
            ownerId={previewTemplate.id}
            library={library.filter((l) => l.is_active !== false)}
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
              // The Lift, not the warm-up (TR7).
              highlights: dayHighlights(day.program_template_exercises, 3),
            }))}
            renderDayControls={(summary: ProgramDaySummary) => {
              const day = previewTemplate.program_template_days.find((d) => d.id === summary.id)!;
              return (
                <>
                  {/* The day of the week is in the tile (or the name) and set from this menu (LB13: a third copy sat here as a dropdown). */}
                  <DropdownMenu
                    triggerLabel={`Actions for ${day.day_label}`}
                    items={[
                      { label: 'Rename', onSelect: () => setRenameDay({ id: day.id, name: day.day_label, position: day.day_position }) },
                      { label: day.day_position == null ? 'Set the day' : 'Change the day', onSelect: () => setChangeDay({ id: day.id, label: day.day_label, position: day.day_position }) },
                      { label: 'Copy to next week', onSelect: () => handleCopyDay(previewTemplate, day) },
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
                className="inline-flex h-11 items-center rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground"
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
                  ? 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 text-sm font-extrabold text-accent-foreground disabled:opacity-40'
                  : 'inline-flex h-11 items-center justify-center gap-1.5 rounded-xl border-[1.5px] border-black/20 px-4 text-sm font-bold text-black dark:border-white/25 dark:text-zinc-50 disabled:opacity-40'
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

          {changeDay && (
            <BottomSheet title={`Which day is “${changeDay.label}”?`} onClose={() => setChangeDay(null)}>
              <div className="space-y-4">
                <p className="text-sm text-zinc-600 dark:text-zinc-400">
                  Programmes started from this template put this workout on that day. Tap the picked day again for no day.
                </p>
                <WeekdayChips value={changeDay.position} onChange={(v) => setChangeDay({ ...changeDay, position: v })} />
                <Button
                  variant="primary"
                  className="w-full"
                  disabled={mutating}
                  onClick={() => {
                    const target = changeDay;
                    void runMutate(() => updateTemplateDay(target.id, { day_position: target.position }), {
                      success: target.position == null ? 'Day cleared' : `Moved to ${WEEKDAY_SHORT[target.position]}`,
                      onDone: () => setChangeDay(null),
                    });
                  }}
                >
                  {mutating ? 'Saving…' : 'Save day'}
                </Button>
              </div>
            </BottomSheet>
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
                    onChange={(e) => {
                      setAssignStart(e.target.value);
                      setAssignStartPicked(true);
                    }}
                  />
                  {assignAudience === 'all' && followOn && !assignStartPicked && assignStart === followOn.startDate && (
                    <p className="text-xs text-zinc-500">{followOnLabel(followOn)}.</p>
                  )}
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
                        onClick={() => chooseAudience(a)}
                        className={`h-11 rounded-full px-4 text-sm font-bold ${
                          assignAudience === a ? 'bg-[#1d1d1b] text-white dark:bg-zinc-100 dark:text-[#1d1d1b]' : 'border border-black/[.14] bg-card text-black hover:bg-black/[.03] dark:border-white/15 dark:text-zinc-50'
                        }`}
                      >
                        {a === 'all' ? `Everyone at the gym${gymMemberCount != null ? ` (${gymMemberCount})` : ''}` : 'Choose members'}
                      </button>
                    ))}
                  </div>
                  {assignAudience === 'all' && (
                    <p className="text-xs text-zinc-500">
                      It becomes the gym programme for the weeks below: members who join the gym in that time get it too, on the gym’s
                      current week.
                    </p>
                  )}
                </div>
                {assignAudience === 'all' && (
                  <div className="space-y-1">
                    <label htmlFor="assign-weeks" className="text-xs font-medium text-zinc-500">
                      Length
                    </label>
                    <select
                      id="assign-weeks"
                      className="w-full rounded-xl border border-black/10 bg-transparent px-3 py-2.5 text-base dark:border-white/10"
                      value={assignWeeks}
                      onChange={(e) => setAssignWeeks(Number(e.target.value))}
                    >
                      {Array.from({ length: MAX_GYM_PROGRAMME_WEEKS - MIN_GYM_PROGRAMME_WEEKS + 1 }, (_, i) => i + MIN_GYM_PROGRAMME_WEEKS).map((n) => (
                        <option key={n} value={n}>
                          {weeksLabel(n)}
                        </option>
                      ))}
                    </select>
                    <p className="text-xs text-zinc-500">
                      {assignRuns}
                      {builtWeeksNote(assignWeeks, builtWeeks(previewTemplate)) ? ` · template: ${builtWeeksNote(assignWeeks, builtWeeks(previewTemplate))}` : ''}
                    </p>
                    {assignOverlap && <p className="text-xs font-semibold text-warning">{assignOverlap}</p>}
                  </div>
                )}
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
                  {assigning ? 'Saving…' : rolloutButtonLabel(rolloutPlan)}
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
            library={library.filter((l) => l.is_active !== false)}
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
