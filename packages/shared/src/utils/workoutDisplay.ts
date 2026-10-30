import type { BlockType, PrescriptionType } from '../data/types';
import { prescriptionParts } from '../workoutTracking';
import {
  PART_TITLE,
  SECTIONS,
  SECTION_TITLE,
  blockFormatOf,
  blockKey,
  formatDescription,
  groupIntoBlocks,
  normalisedBlock,
  parseBlockKey,
  usesSections,
  type BlockPart,
  type SectionedExercise,
  type WorkoutSection,
} from '../workoutSections';

// How a member's workout day is laid out and described. Moved from the web ExerciseEditor (the member / read-only
// branch) so web and mobile cannot drift.

export function blockLabel(section: WorkoutSection, blockNo: number | null, part: BlockPart | null = null): string {
  const b = normalisedBlock(section, blockNo);
  if (b == null) return SECTION_TITLE[section];
  if (b === 0) return `${SECTION_TITLE[section]} · 20 min`;
  const base = `${SECTION_TITLE[section]} · Block ${b}`;
  return b === 2 && part ? `${base} · ${PART_TITLE[part]}` : base;
}

export function keyLabel(key: string): string {
  const { section, blockNo, part } = parseBlockKey(key);
  return blockLabel(section, blockNo, part);
}

export interface PrescriptionFields {
  block_type: BlockType;
  notes: string | null;
  sets: number | null;
  reps: string | null;
  prescription_type: PrescriptionType;
  percent_1rm: number | null;
  load: number | null;
  rpe: number | null;
  rest_seconds: number | null;
  // What is recorded and the targets for the types that are not weight x reps (migration 0151); absent means weight x reps.
  tracking_type?: string | null;
  target_seconds?: number | null;
  target_distance?: number | null;
  target_calories?: number | null;
}

// One line saying what to do, e.g. "3 × 8-10 · 20kg · RPE 8 · rest 60s".
export function prescriptionSummary(ex: PrescriptionFields): string {
  if (ex.block_type === 'circuit') return ex.notes ? ex.notes.split('\n')[0] : 'Instructions';
  const parts = prescriptionParts(ex);
  if (ex.rpe != null) parts.push(`RPE ${ex.rpe}`);
  if (ex.rest_seconds != null) parts.push(`rest ${ex.rest_seconds}s`);
  return parts.length > 0 ? parts.join(' · ') : 'Tap to set sets and reps';
}

export interface DisplayBlock<T> {
  key: string;
  title: string | null;
  description?: string;
  rows: T[];
}

// The member's (read-only) layout of a day. Days that use sections show headed blocks; with `withChoices`, only
// Warm-up and Lift appear straight away and Strong / Conditioning come from the member's picks for the two
// 10-minute slots (`choosing`). Days that don't use sections are one plain list.
export function memberDayBlocks<T extends SectionedExercise>(exercises: T[], withChoices: boolean) {
  const sorted = [...exercises].sort((a, b) => a.sort_order - b.sort_order);
  const blocks = groupIntoBlocks(sorted);
  const sectioned = usesSections(sorted);
  const present = new Set(Array.from(blocks.entries()).filter(([, rows]) => rows.length > 0).map(([k]) => k));
  const choosing = sectioned && withChoices && Array.from(present).some((k) => k.startsWith('strong') || k.startsWith('conditioning'));

  const ordered: DisplayBlock<T>[] = [];
  if (sectioned) {
    for (const sec of SECTIONS) {
      if (choosing && (sec.key === 'strong' || sec.key === 'conditioning')) continue;
      const keys =
        sec.key === 'conditioning'
          ? [blockKey(sec.key, 0), blockKey(sec.key, 1), blockKey(sec.key, 2), blockKey(sec.key, 2, 'breath'), blockKey(sec.key, 2, 'burn')]
          : sec.key === 'strong'
            ? [blockKey(sec.key, 1), blockKey(sec.key, 2), blockKey(sec.key, 2, 'upper'), blockKey(sec.key, 2, 'lower')]
            : sec.blocks.map((bn) => blockKey(sec.key, bn));
      for (const key of keys) {
        const rows = blocks.get(key) ?? [];
        if (rows.length === 0) continue;
        ordered.push(blockForDisplay(key, rows));
      }
    }
  } else {
    ordered.push({ key: 'all', title: null, rows: sorted });
  }
  return { sectioned, choosing, present, blocks, ordered };
}

// A titled block: "Strong · Block 1 · AMRAP" with the format's one-line explanation when it has one.
export function blockForDisplay<T extends Pick<SectionedExercise, 'block_format'>>(key: string, rows: T[]): DisplayBlock<T> {
  const format = blockFormatOf(rows);
  return { key, title: `${keyLabel(key)}${format ? ` · ${format}` : ''}`, description: formatDescription(format), rows };
}
