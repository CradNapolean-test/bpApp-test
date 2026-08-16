// Plain data-shaping helpers for programme template export/import -- deliberately NOT a
// 'use server' file (unlike programTemplates.ts): toTemplateExport is a pure sync function
// called directly from the client component (ProgramTemplateManager) on data it already has,
// and a 'use server' file requires every export to be async (Next.js Server Actions rule).
import type {
  BlockType,
  PrescriptionType,
  ProgramTemplateWithDays,
} from './types';

// Transfer shape for template export/import -- deliberately not a DB row type: no ids (a fresh
// import always creates new rows) and exercise_library_id is dropped in favor of re-resolving
// by name against whichever gym's library the file lands in (see importProgramTemplate in
// programTemplates.ts), since a library id from the exporting gym is meaningless anywhere else.
export interface TemplateExportExercise {
  name: string;
  sets: number | null;
  reps: string | null;
  load: number | null;
  rpe: number | null;
  notes: string | null;
  video_url: string | null;
  superset_group: string | null;
  rest_seconds: number | null;
  sort_order: number;
  block_type: BlockType;
  prescription_type: PrescriptionType;
  percent_1rm: number | null;
  progression_load_increment: number | null;
  progression_every_weeks: number;
}

export interface TemplateExportDay {
  week_num: number;
  day_label: string;
  sort_order: number;
  phase_label: string | null;
  notes: string | null;
  day_position: number | null;
  exercises: TemplateExportExercise[];
}

export interface TemplateExport {
  version: 1;
  name: string;
  days: TemplateExportDay[];
}

export function toTemplateExport(template: ProgramTemplateWithDays): TemplateExport {
  return {
    version: 1,
    name: template.name,
    days: template.program_template_days.map((day) => ({
      week_num: day.week_num,
      day_label: day.day_label,
      sort_order: day.sort_order,
      phase_label: day.phase_label,
      notes: day.notes,
      day_position: day.day_position,
      exercises: day.program_template_exercises.map((ex) => ({
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
      })),
    })),
  };
}
