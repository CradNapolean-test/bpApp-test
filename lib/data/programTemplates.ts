'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import { after } from 'next/server';
import { notifyProgrammeAssigned, notifyStartedRollout } from '@/lib/memberNotify';
import type { RolloutUpdateCounts } from '@/lib/rolloutUpdate';
import { deleteWeekRefusal, readGymProgramme, type GymProgramme, type WaitingOutcome } from '@/lib/gymProgramme';
import { nextWeekCopy } from '@/lib/utils/programmeDays';
import type {
  ProgrammeRolloutRow,
  ProgramTemplateDayRow,
  ProgramTemplateExerciseRow,
  ProgramTemplateRow,
  ProgramTemplateWithDays,
} from './types';

// forGymId: a member's page lists the templates of the MEMBER'S gym; everywhere else it is the gym being worked in (R38).
export async function getProgramTemplates(forGymId?: string | null): Promise<ProgramTemplateRow[]> {
  const supabase = await createClient();
  const gymId = forGymId ?? (await resolveScopingGymId(supabase));
  const { data, error } = await supabase
    .from('program_templates')
    .select('*')
    .eq('gym_id', gymId)
    .order('created_at');
  if (error) raise(error);
  return data ?? [];
}

export async function getProgramTemplatesWithDays(): Promise<ProgramTemplateWithDays[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('program_templates')
    .select('*, program_template_days(*, program_template_exercises(*))')
    .eq('gym_id', gymId)
    .order('created_at');
  if (error) raise(error);
  return (data ?? []) as unknown as ProgramTemplateWithDays[];
}

export async function getProgramTemplateWithDays(templateId: string): Promise<ProgramTemplateWithDays | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('program_templates')
    .select('*, program_template_days(*, program_template_exercises(*))')
    .eq('id', templateId)
    .maybeSingle();
  if (error) raise(error);
  return data as unknown as ProgramTemplateWithDays | null;
}

// expectedGymId (on every write here): the gym the page was drawn for; see lib/data/gymGuard.ts (R28).
export async function createProgramTemplate(name: string, expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase.from('program_templates').insert({ coach_id: user.id, gym_id: gymId, name });
  if (error) raise(error);
}

export async function updateProgramTemplate(
  templateId: string,
  fields: { name?: string; description?: string | null }
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_templates').update(fields).eq('id', templateId);
  if (error) raise(error);
}

// Creates a template and returns its id so the editor can open straight onto it.
export async function createProgramTemplateAndGetId(name: string, expectedGymId?: string | null): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale as { ok: false; error: string };
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('program_templates')
    .insert({ coach_id: user.id, gym_id: gymId, name })
    .select('id')
    .single();
  if (error) raise(error);
  return { ok: true, id: data.id };
}

// Removes every day (and its exercises) in one week of a template.
// Deletes one week of a template and closes the gap: weeks after it move down by one, so deleting week 2 of 4 leaves 1, 2, 3 and not
// 1, 3, 4 (a gap hands members an empty programme week). The later weeks are renumbered in ascending order in the same call.
// Either way the template ends a week sooner, and so would the gym programme it is: only a gym admin can do that (migration 0172).
// Asked first, as the database would refuse only the last renumbering, after this week's workouts had gone. Returned, not thrown, so the
// coach reads why.
export async function deleteTemplateWeek(templateId: string, weekNum: number): Promise<ActionResult> {
  const supabase = await createClient();
  const refusal = await deleteWeekRefusalFor(supabase, templateId);
  if (refusal) return fail(null, refusal);

  const { error } = await supabase
    .from('program_template_days')
    .delete()
    .eq('template_id', templateId)
    .eq('week_num', weekNum);
  if (error) return fail(error, 'Could not delete that week');

  const { data: later, error: laterError } = await supabase
    .from('program_template_days')
    .select('week_num')
    .eq('template_id', templateId)
    .gt('week_num', weekNum);
  if (laterError) return fail(laterError, 'Could not move the weeks after it up');
  const weeks = Array.from(new Set((later ?? []).map((d) => d.week_num as number))).sort((x, y) => x - y);
  for (const week of weeks) {
    const { error: moveError } = await supabase
      .from('program_template_days')
      .update({ week_num: week - 1 })
      .eq('template_id', templateId)
      .eq('week_num', week);
    if (moveError) return fail(moveError, 'Could not move the weeks after it up');
  }
  return ok();
}

// Why this coach can't delete a week of the template: it is the gym programme (gym_programmes(), the coach's gym) and they are not a gym
// admin there, as the database checks (is_admin_of_gym). null when they can, or when it can't be told (before migration 0172).
async function deleteWeekRefusalFor(supabase: Awaited<ReturnType<typeof createClient>>, templateId: string): Promise<string | null> {
  const { data, error } = await supabase.rpc('gym_programmes');
  if (error || !Array.isArray(data)) return null;
  const gym = data.map(readGymProgramme).find((g) => g?.templateId === templateId);
  if (!gym) return null;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const gymId = await resolveScopingGymId(supabase);
  const { data: membership } = await supabase
    .from('coach_gym_memberships')
    .select('is_gym_admin')
    .eq('coach_id', user.id)
    .eq('gym_id', gymId)
    .maybeSingle();
  return membership?.is_gym_admin === true ? null : deleteWeekRefusal(gym);
}
// Returned, not thrown, so the coach reads why it was refused: only a gym admin can delete the template of the gym programme or of a start
// for everyone (migration 0172).
export async function deleteProgramTemplate(templateId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_templates').delete().eq('id', templateId);
  if (error) return fail(error, 'Could not delete that template');
  return ok();
}

export async function addTemplateDay(
  templateId: string,
  weekNum: number,
  dayLabel: string,
  dayPosition: number | null = null
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_days')
    .insert({ template_id: templateId, week_num: weekNum, day_label: dayLabel, day_position: dayPosition });
  if (error) raise(error);
}

// Returned, not thrown, so the coach reads why it was refused: the last workout of the gym programme's last week is a gym admin's to delete
// (migration 0172).
export async function deleteTemplateDay(dayId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_days').delete().eq('id', dayId);
  if (error) return fail(error, 'Could not delete that workout');
  return ok();
}

export async function addTemplateExercise(
  templateDayId: string,
  fields: Omit<ProgramTemplateExerciseRow, 'id' | 'template_day_id'>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_exercises')
    .insert({ template_day_id: templateDayId, ...fields });
  if (error) raise(error);
}

export async function deleteTemplateExercise(exerciseId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').delete().eq('id', exerciseId);
  if (error) raise(error);
}

// Persists a full drag-and-drop reorder: one update per row rather than a dedicated RPC,
// since there's no invariant here RLS can't already enforce and day-sized lists are small.
export async function reorderTemplateExercises(orderedIds: string[]): Promise<void> {
  const supabase = await createClient();
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('program_template_exercises').update({ sort_order: index }).eq('id', id))
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) raise(failed.error);
}

export async function updateTemplateExercise(
  exerciseId: string,
  fields: Partial<Omit<ProgramTemplateExerciseRow, 'id' | 'template_day_id'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').update(fields).eq('id', exerciseId);
  if (error) raise(error);
}

// Applies the same change to several exercises in one save (e.g. setting a block's format, or
// splitting Strong block 2 into Upper / Lower), instead of one request per exercise.
export async function updateTemplateExercises(
  exerciseIds: string[],
  fields: Partial<Omit<ProgramTemplateExerciseRow, 'id' | 'template_day_id'>>
): Promise<void> {
  if (exerciseIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').update(fields).in('id', exerciseIds);
  if (error) raise(error);
}

export async function updateTemplateDay(
  dayId: string,
  fields: Partial<Pick<ProgramTemplateDayRow, 'week_num' | 'day_label' | 'phase_label' | 'notes' | 'day_position'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_days').update(fields).eq('id', dayId);
  if (error) raise(error);
}

// Copies a template day (and every one of its exercises) into a new day at the given
// week/label -- "Copy Workout" from the day menu, mirroring workouts.ts's duplicateProgramDay.
export async function duplicateTemplateDay(dayId: string, weekNum: number, dayLabel: string): Promise<void> {
  const supabase = await createClient();
  const { data: sourceDay, error: dayError } = await supabase
    .from('program_template_days')
    .select('template_id, phase_label, notes, day_position')
    .eq('id', dayId)
    .single();
  if (dayError) raise(dayError);

  const { data: exercises, error: exercisesError } = await supabase
    .from('program_template_exercises')
    .select('*')
    .eq('template_day_id', dayId);
  if (exercisesError) raise(exercisesError);

  const { data: newDay, error: insertDayError } = await supabase
    .from('program_template_days')
    .insert({
      template_id: sourceDay.template_id,
      week_num: weekNum,
      day_label: dayLabel,
      phase_label: sourceDay.phase_label,
      notes: sourceDay.notes,
      day_position: sourceDay.day_position,
    })
    .select('id')
    .single();
  if (insertDayError) raise(insertDayError);

  if (exercises && exercises.length > 0) {
    const copies = exercises.map((ex) => ({
      template_day_id: newDay.id,
      exercise_library_id: ex.exercise_library_id,
      name: ex.name,
      sets: ex.sets,
      reps: ex.reps,
      load: ex.load,
      rpe: ex.rpe,
      notes: ex.notes,
      video_url: ex.video_url,
      superset_group: ex.superset_group,
      rest_seconds: ex.rest_seconds,
      sort_order: ex.sort_order,
      block_type: ex.block_type,
      prescription_type: ex.prescription_type,
      percent_1rm: ex.percent_1rm,
      progression_load_increment: ex.progression_load_increment,
      progression_every_weeks: ex.progression_every_weeks,
      section: ex.section,
      block_no: ex.block_no,
      block_format: ex.block_format,
      block_config: ex.block_config,
      block_part: ex.block_part,
      tracking_type: ex.tracking_type,
      target_seconds: ex.target_seconds,
      target_distance: ex.target_distance,
      target_calories: ex.target_calories,
    }));
    const { error: insertExercisesError } = await supabase.from('program_template_exercises').insert(copies);
    if (insertExercisesError) raise(insertExercisesError);
  }
}

// "Add week (copy of last)": copies the template's last week, as the database has it now, into the week after it. Null when the template
// has no workouts yet. The weeks are read here, not taken from the screen, which may not have reloaded since the last tap (nextWeekCopy).
export async function addTemplateWeek(templateId: string): Promise<{ from: number; to: number } | null> {
  const supabase = await createClient();
  const { data: days, error } = await supabase
    .from('program_template_days')
    .select('id, week_num, day_label, day_position')
    .eq('template_id', templateId);
  if (error) raise(error);
  const copy = nextWeekCopy(days ?? []);
  if (!copy) return null;
  await Promise.all(copy.source.map((d) => duplicateTemplateDay(d.id, copy.to, d.day_label)));
  return { from: copy.from, to: copy.to };
}

// Bulk-applies the same field values across every exercise in a template day in one round
// trip, mirroring workouts.ts's applyFieldsToDay.
export async function applyFieldsToTemplateDay(
  dayId: string,
  fields: Partial<Pick<ProgramTemplateExerciseRow, 'rest_seconds' | 'rpe'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_exercises').update(fields).eq('template_day_id', dayId);
  if (error) raise(error);
}

// Copies a template (name, days, exercises) into a brand new template for the same coach --
// not a client, so an edit afterward never touches anything already assigned to clients.
export async function duplicateProgramTemplate(templateId: string, newName: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { data, error } = await supabase.rpc('duplicate_program_template', {
    p_template_id: templateId,
    p_new_name: newName,
  });
  if (error) return fail(error, 'Could not duplicate that template');
  // The RPC predates descriptions, so carry it across here (ignored if migration 0090 is missing).
  const created = data as { id?: string } | null;
  const { data: source } = await supabase.from('program_templates').select('description').eq('id', templateId).maybeSingle();
  if (created?.id && source?.description) {
    await supabase.from('program_templates').update({ description: source.description }).eq('id', created.id);
  }
  return ok();
}

// Recreates a template (and every day and exercise) from an exported file -- see toTemplateExport for the shape. One database call
// (import_program_template, migration 0133): the whole template is built in one transaction, so a failure can no longer leave a
// half-built template, and the database checks the shape and limits (20 weeks, 14 days a week, 60 exercises a day) itself. Each
// exercise is linked to the library entry with the same name (ignoring case and spacing) when there is one; a file from another gym
// carries no ids that would mean anything here.
export async function importProgramTemplate(rawData: unknown, expectedGymId?: string | null): Promise<ActionResult> {
  const stale = await checkActiveGym(await createClient(), expectedGymId);
  if (stale) return stale;
  if (!rawData || typeof rawData !== 'object' || Array.isArray(rawData)) {
    return fail(null, 'That file isn\u2019t a recognized programme template export');
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc('import_program_template', { p_json: rawData });
  return error ? fail(error, 'Could not import that programme template') : ok();
}

// Copies the template into a real program for this client (snapshot, not a live reference --
// see 0013_exercise_library_and_program_templates.sql). Returns rather than throws since this
// is a user-facing domain error path ("Programme template not found") that Next.js would
// otherwise redact in production -- see result.ts.
export async function instantiateProgramTemplate(
  templateId: string,
  clientId: string,
  programName: string,
  startDate: string | null = null
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('instantiate_program_template', {
    p_template_id: templateId,
    p_client_id: clientId,
    p_program_name: programName,
    p_start_date: startDate,
  });
  if (error) return fail(error, 'Could not start that programme');
  // D20: the member is told (in the app, and by push) when a coach sets them up with a programme; not when they start one themselves.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user && user.id !== clientId) after(() => notifyProgrammeAssigned(clientId, programName));
  return ok();
}

// Rollouts not yet given out, soonest first.
export async function getPendingRollouts(): Promise<ProgrammeRolloutRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('programme_rollouts')
    .select('id, template_id, program_name, start_date, audience, client_ids, applied_at, program_templates(name)')
    .eq('gym_id', gymId)
    .is('applied_at', null)
    .order('start_date');
  // Migration 0094 not applied yet: no rollouts, rather than breaking the library.
  if (error) return [];
  return (data ?? []).map((r) => {
    const template = Array.isArray(r.program_templates) ? r.program_templates[0] : r.program_templates;
    return {
      id: r.id,
      template_id: r.template_id,
      template_name: template?.name ?? null,
      program_name: r.program_name,
      start_date: r.start_date,
      audience: r.audience as 'all' | 'selected',
      client_ids: r.client_ids ?? [],
      applied_at: r.applied_at,
    };
  });
}

// Schedules a template for a start date. Everyone it covers gets their own copy on that date (the daily job does it), or straight
// away when the date is today or earlier (`startsNow`). One database call (schedule_programme_rollout, migration 0133): the rollout
// is saved and, if it starts now, applied in the same transaction, so a failure leaves nothing queued for the overnight job (R5).
// `count` is how many members it reached (or will reach).
export type ScheduleRolloutResult = { ok: true; count: number } | { ok: false; error: string };

export async function scheduleProgrammeRollout(input: {
  templateId: string;
  programName: string;
  startDate: string;
  audience: 'all' | 'selected';
  clientIds: string[];
  startsNow: boolean;
  // The gym the page was drawn for (R28): "everyone" means this gym's members, so it must still be the active one.
  expectedGymId?: string | null;
}): Promise<ScheduleRolloutResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, input.expectedGymId);
  if (stale) return stale as ScheduleRolloutResult;
  const { data, error } = await supabase.rpc('schedule_programme_rollout', {
    p_template_id: input.templateId,
    p_program_name: input.programName,
    p_start: input.startDate,
    p_audience: input.audience,
    p_client_ids: input.audience === 'selected' ? input.clientIds : [],
    p_starts_now: input.startsNow,
  });
  if (error) return fail(error, 'Could not start that programme') as ScheduleRolloutResult;
  const count = typeof data === 'number' ? data : 0;
  // D20: when it starts now, everyone it reached is told (in the app, and by push). A later start is told by the daily job that hands it
  // out (app/api/cron/apply-programme-rollouts).
  if (input.startsNow && count > 0) {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const startedBy = user.id;
      after(() =>
        notifyStartedRollout({ startedBy, templateId: input.templateId, startDate: input.startDate, audience: input.audience })
      );
    }
  }
  return { ok: true, count };
}

// How many members "Everyone at the gym" means: the clients who belong to the gym being worked in (their own gym, not their coach's).
export async function getGymMemberCount(): Promise<number> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'client').eq('gym_id', gymId);
  return count ?? 0;
}
export async function cancelProgrammeRollout(rolloutId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('programme_rollouts').delete().eq('id', rolloutId).is('applied_at', null).select('id');
  if (error) return fail(error, 'Could not cancel that');
  // Nothing deleted: it has started already, or it is for everyone at the gym and only a gym admin can cancel that (migration 0172).
  if (!data || data.length === 0) return fail(null, 'That couldn’t be cancelled: it has started, or only a gym admin can cancel one for everyone.');
  return ok();
}

// D8 (LB1, TR18): who is still on each rollout of a template, and copying the template's later weeks into their copies (migration 0167).
export type RolloutUsageRow = {
  rolloutId: string;
  templateId: string;
  programName: string;
  startDate: string;
  audience: 'all' | 'selected';
  // Members whose copy from this rollout is still running or not started (not finished, not replaced by a later programme).
  members: number;
};

// The given-out rollouts at the gym that members are still on. Empty until migration 0167 is applied, rather than breaking the library.
export async function getRolloutUsage(): Promise<RolloutUsageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('programme_rollout_usage');
  if (error || !Array.isArray(data)) return [];
  return data.map((r: { rollout_id: string; template_id: string; program_name: string; start_date: string; audience: string; members: number }) => ({
    rolloutId: r.rollout_id,
    templateId: r.template_id,
    programName: r.program_name,
    startDate: r.start_date,
    audience: r.audience === 'all' ? 'all' : 'selected',
    members: r.members ?? 0,
  }));
}

function readUpdateCounts(data: unknown): RolloutUpdateCounts {
  const d = (data ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' ? v : 0);
  return { members: n(d.members), daysRemoved: n(d.days_removed), daysAdded: n(d.days_added), daysKept: n(d.days_kept) };
}

// What applying would change, without changing anything (for the confirm).
export async function previewTemplateToRollout(rolloutId: string): Promise<{ ok: true; counts: RolloutUpdateCounts } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('apply_template_to_rollout', { p_rollout_id: rolloutId, p_dry_run: true });
  if (error) return fail(error, 'Could not check that programme') as { ok: false; error: string };
  return { ok: true, counts: readUpdateCounts(data) };
}

// Copies the template into every live copy on the rollout, for the weeks each member hasn't reached yet. Days a member has logged on
// are kept, and the week they are in now is never changed.
export async function applyTemplateToRollout(
  rolloutId: string,
  expectedGymId?: string | null
): Promise<{ ok: true; counts: RolloutUpdateCounts } | { ok: false; error: string }> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale as { ok: false; error: string };
  const { data, error } = await supabase.rpc('apply_template_to_rollout', { p_rollout_id: rolloutId, p_dry_run: false });
  if (error) return fail(error, 'Could not update that programme') as { ok: false; error: string };
  return { ok: true, counts: readUpdateCounts(data) };
}

// Item 7 (migration 0172): the programme the coach's gym is on today ("Gym programme: Salford Quays from 9 Nov · 16 members"), while its
// last week has not finished, with the members it was not given to. Empty until migration 0172 is applied, rather than breaking the library.
export async function getGymProgrammes(): Promise<GymProgramme[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('gym_programmes');
  if (error || !Array.isArray(data)) return [];
  return data.map(readGymProgramme).filter((p): p is GymProgramme => p !== null);
}

// Stops members who join the gym from now on getting it. The members on it keep it. A gym admin only (checked in the database).
export async function endGymProgramme(rolloutId: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('end_gym_programme', { p_rollout_id: rolloutId });
  return error ? fail(error, 'Could not end the gym programme') : ok();
}

// "Give it to them" (give) or "Keep theirs" for a member the gym programme was not given to when they joined. Their coach or a gym admin.
export async function resolveGymProgrammeWaiting(input: {
  rolloutId: string;
  clientId: string;
  give: boolean;
  expectedGymId?: string | null;
}): Promise<{ ok: true; outcome: WaitingOutcome } | { ok: false; error: string }> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, input.expectedGymId);
  if (stale) return stale as { ok: false; error: string };
  const { data, error } = await supabase.rpc('resolve_gym_programme_waiting', {
    p_rollout_id: input.rolloutId,
    p_client_id: input.clientId,
    p_give: input.give,
  });
  if (error) return fail(error, 'Could not do that') as { ok: false; error: string };
  const outcome: WaitingOutcome = data === 'given' || data === 'has_it' ? data : 'kept';
  // D20: a member is told when a coach sets them up with a programme. The name is the rollout's own, read here rather than sent by the page.
  if (outcome === 'given') {
    const { data: rollout } = await supabase.from('programme_rollouts').select('program_name').eq('id', input.rolloutId).maybeSingle();
    const clientId = input.clientId;
    after(() => notifyProgrammeAssigned(clientId, rollout?.program_name ?? null));
  }
  return { ok: true, outcome };
}
