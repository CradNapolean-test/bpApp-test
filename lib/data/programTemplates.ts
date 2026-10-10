'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { TemplateExport, TemplateExportDay, TemplateExportExercise } from './templateTransfer';
import type {
  ProgrammeRolloutRow,
  ProgramTemplateDayRow,
  ProgramTemplateExerciseRow,
  ProgramTemplateRow,
  ProgramTemplateWithDays,
} from './types';

export async function getProgramTemplates(): Promise<ProgramTemplateRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
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

export async function createProgramTemplate(name: string): Promise<void> {
  const supabase = await createClient();
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
export async function createProgramTemplateAndGetId(name: string): Promise<string> {
  const supabase = await createClient();
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
  return data.id;
}

// Removes every day (and its exercises) in one week of a template.
export async function deleteTemplateWeek(templateId: string, weekNum: number): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('program_template_days')
    .delete()
    .eq('template_id', templateId)
    .eq('week_num', weekNum);
  if (error) raise(error);
}

export async function deleteProgramTemplate(templateId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_templates').delete().eq('id', templateId);
  if (error) raise(error);
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

export async function deleteTemplateDay(dayId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('program_template_days').delete().eq('id', dayId);
  if (error) raise(error);
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
      block_part: ex.block_part,
    }));
    const { error: insertExercisesError } = await supabase.from('program_template_exercises').insert(copies);
    if (insertExercisesError) raise(insertExercisesError);
  }
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
export async function duplicateProgramTemplate(templateId: string, newName: string): Promise<ActionResult> {
  const supabase = await createClient();
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

// Structural validation for an uploaded file's parsed JSON -- this crossed a trust boundary
// (a coach's local file), so it gets checked field-by-field rather than just cast, unlike
// every other function here which trusts its own UI's typed callers.
function validateTemplateExport(data: unknown): TemplateExport | null {
  if (!data || typeof data !== 'object') return null;
  const d = data as Record<string, unknown>;
  if (typeof d.name !== 'string' || !d.name.trim() || !Array.isArray(d.days)) return null;

  const days: TemplateExportDay[] = [];
  for (const rawDay of d.days) {
    if (!rawDay || typeof rawDay !== 'object') return null;
    const day = rawDay as Record<string, unknown>;
    if (typeof day.week_num !== 'number' || typeof day.day_label !== 'string' || !Array.isArray(day.exercises)) {
      return null;
    }
    const exercises: TemplateExportExercise[] = [];
    for (const rawEx of day.exercises) {
      if (!rawEx || typeof rawEx !== 'object') return null;
      const ex = rawEx as Record<string, unknown>;
      if (typeof ex.name !== 'string' || !ex.name.trim()) return null;
      exercises.push({
        name: ex.name,
        sets: typeof ex.sets === 'number' ? ex.sets : null,
        reps: typeof ex.reps === 'string' ? ex.reps : null,
        load: typeof ex.load === 'number' ? ex.load : null,
        rpe: typeof ex.rpe === 'number' ? ex.rpe : null,
        notes: typeof ex.notes === 'string' ? ex.notes : null,
        video_url: typeof ex.video_url === 'string' ? ex.video_url : null,
        superset_group: typeof ex.superset_group === 'string' ? ex.superset_group : null,
        rest_seconds: typeof ex.rest_seconds === 'number' ? ex.rest_seconds : null,
        sort_order: typeof ex.sort_order === 'number' ? ex.sort_order : 0,
        block_type: ex.block_type === 'circuit' ? 'circuit' : 'exercise',
        prescription_type: ex.prescription_type === 'percent_1rm' ? 'percent_1rm' : 'absolute',
        percent_1rm: typeof ex.percent_1rm === 'number' ? ex.percent_1rm : null,
        progression_load_increment: typeof ex.progression_load_increment === 'number' ? ex.progression_load_increment : null,
        progression_every_weeks: typeof ex.progression_every_weeks === 'number' ? ex.progression_every_weeks : 1,
        section:
          ex.section === 'warmup' || ex.section === 'strong' || ex.section === 'conditioning' ? ex.section : 'lift',
        block_no: ex.block_no === 1 || ex.block_no === 2 ? ex.block_no : null,
        block_format: typeof ex.block_format === 'string' ? ex.block_format : null,
        block_part: ex.block_part === 'upper' || ex.block_part === 'lower' || ex.block_part === 'breath' || ex.block_part === 'burn' ? ex.block_part : null,
      });
    }
    days.push({
      week_num: day.week_num,
      day_label: day.day_label,
      sort_order: typeof day.sort_order === 'number' ? day.sort_order : 0,
      phase_label: typeof day.phase_label === 'string' ? day.phase_label : null,
      notes: typeof day.notes === 'string' ? day.notes : null,
      day_position: typeof day.day_position === 'number' ? day.day_position : null,
      exercises,
    });
  }
  return { version: 1, name: d.name, days };
}

// Recreates a template (and every day/exercise) from an exported file -- see toTemplateExport
// for the mirrored shape. exercise_library_id is re-resolved by case/whitespace-insensitive
// name match against the *importing* gym's current library rather than trusting any id in the
// file (which would point at the exporting gym's library, meaningless here); exercises with no
// match still import fine since name is always stored as free text regardless of the link.
export async function importProgramTemplate(rawData: unknown): Promise<ActionResult> {
  const data = validateTemplateExport(rawData);
  if (!data) return fail(null, 'That file isn’t a recognized programme template export');

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { data: library, error: libraryError } = await supabase.from('exercise_library').select('id, name');
  if (libraryError) return fail(libraryError, 'Could not load the exercise library');
  const libraryByName = new Map((library ?? []).map((ex) => [ex.name.trim().toLowerCase(), ex.id]));

  const { data: newTemplate, error: templateError } = await supabase
    .from('program_templates')
    .insert({ coach_id: user.id, gym_id: gymId, name: data.name })
    .select('id')
    .single();
  if (templateError) return fail(templateError, 'Could not create the template');

  for (const day of data.days) {
    const { data: newDay, error: dayError } = await supabase
      .from('program_template_days')
      .insert({
        template_id: newTemplate.id,
        week_num: day.week_num,
        day_label: day.day_label,
        sort_order: day.sort_order,
        phase_label: day.phase_label,
        notes: day.notes,
        day_position: day.day_position,
      })
      .select('id')
      .single();
    if (dayError) return fail(dayError, 'Could not import a day in that template');

    if (day.exercises.length > 0) {
      const { error: exercisesError } = await supabase.from('program_template_exercises').insert(
        day.exercises.map((ex) => ({
          template_day_id: newDay.id,
          exercise_library_id: libraryByName.get(ex.name.trim().toLowerCase()) ?? null,
          ...ex,
        }))
      );
      if (exercisesError) return fail(exercisesError, 'Could not import an exercise in that template');
    }
  }

  return ok();
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
  return error ? fail(error, 'Could not start that programme') : ok();
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

// Schedules a template for a start date. Everyone it covers gets their own copy on that date (the
// daily job does it), or straight away when the date is today or earlier (`startsNow`).
export async function scheduleProgrammeRollout(input: {
  templateId: string;
  programName: string;
  startDate: string;
  audience: 'all' | 'selected';
  clientIds: string[];
  startsNow: boolean;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { data, error } = await supabase
    .from('programme_rollouts')
    .insert({
      gym_id: gymId,
      template_id: input.templateId,
      program_name: input.programName,
      start_date: input.startDate,
      audience: input.audience,
      client_ids: input.audience === 'selected' ? input.clientIds : [],
      created_by: user.id,
    })
    .select('id')
    .single();
  if (error) return fail(error, 'Could not schedule that programme');

  if (input.startsNow) {
    const { error: applyError } = await supabase.rpc('apply_programme_rollout', { p_rollout_id: data.id });
    if (applyError) return fail(applyError, 'Could not start that programme');
  }
  return ok();
}

export async function cancelProgrammeRollout(rolloutId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('programme_rollouts').delete().eq('id', rolloutId).is('applied_at', null);
  return error ? fail(error, 'Could not cancel that') : ok();
}
