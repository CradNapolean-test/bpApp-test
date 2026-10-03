// How a session is laid out: Warm-up, Lift (12 min), then Strong or Conditioning (20 min, two
// 10-minute blocks). Shared by the coach's builder and the member's workout screen.

export type WorkoutSection = 'warmup' | 'lift' | 'strong' | 'conditioning';

// Strong block 2 can be split into an upper body list and a lower body list.
export type BlockPart = 'upper' | 'lower';

export const PART_TITLE: Record<BlockPart, string> = { upper: 'Upper body', lower: 'Lower body' };

export interface SectionDef {
  key: WorkoutSection;
  title: string;
  hint: string;
  // Warm-up and Lift are one list; Strong and Conditioning are two 10-minute blocks. Conditioning can
  // instead be one 20-minute block, stored as block 0.
  blocks: (0 | 1 | 2 | null)[];
}

export const SECTIONS: SectionDef[] = [
  { key: 'warmup', title: 'Warm-up', hint: '', blocks: [null] },
  { key: 'lift', title: 'Lift', hint: '12 min', blocks: [null] },
  { key: 'strong', title: 'Strong', hint: '2 blocks of 10 min', blocks: [1, 2] },
  { key: 'conditioning', title: 'Conditioning', hint: '2 blocks of 10 min', blocks: [1, 2] },
];

export const SECTION_TITLE: Record<WorkoutSection, string> = {
  warmup: 'Warm-up',
  lift: 'Lift',
  strong: 'Strong',
  conditioning: 'Conditioning',
};

// The formats named in the gym's programming SOP. Only the well-known ones carry a description;
// the gym-specific ones (Horse Power, YGIG 100, P-ISO...) are left for the coach to explain in an
// instructions line.
export interface BlockFormat {
  name: string;
  description?: string;
}

export const BLOCK_FORMATS: BlockFormat[] = [
  { name: 'AMRAP', description: 'As many rounds as possible in the block' },
  { name: 'EMOM', description: 'Every minute on the minute' },
  { name: 'Tabata', description: '20 seconds on, 10 seconds off' },
  { name: 'Big Chipper', description: 'One long list, worked through once' },
  { name: 'Ladder', description: 'Reps step up or down each round' },
  { name: 'Descending Reps' },
  { name: 'Ascending Reps' },
  { name: 'Pyramid' },
  { name: 'Circuit' },
  { name: 'Time Killer' },
  { name: 'Horse Power' },
  { name: 'Partner AMRAP' },
  { name: 'Partner Ladder' },
  { name: 'Sets × Reps' },
  { name: '3×12 Ecc' },
  { name: 'Heavy Ecc' },
  { name: 'YGIG 100' },
  { name: 'DESC-15s' },
  { name: 'Drop Sets' },
  { name: 'Mech-Drop' },
  { name: 'P-ISO' },
];

export function formatDescription(name: string | null): string | undefined {
  return BLOCK_FORMATS.find((f) => f.name === name)?.description;
}

export interface SectionedExercise {
  section: WorkoutSection;
  block_no: number | null;
  block_part?: BlockPart | null;
  block_format: string | null;
  sort_order: number;
}

// Strong and Conditioning exercises with no block number sit in block 1; Warm-up and Lift have none.
export function normalisedBlock(section: WorkoutSection, blockNo: number | null): 0 | 1 | 2 | null {
  if (section === 'conditioning' && blockNo === 0) return 0;
  if (section === 'strong' || section === 'conditioning') return blockNo === 2 ? 2 : 1;
  return null;
}

export function blockKey(section: WorkoutSection, blockNo: number | null, part: BlockPart | null = null): string {
  const b = normalisedBlock(section, blockNo);
  if (b == null) return section;
  // Only Strong block 2 splits into parts.
  if (section === 'strong' && b === 2 && part) return `${section}:2:${part}`;
  return `${section}:${b}`;
}

export function exerciseBlockKey(ex: Pick<SectionedExercise, 'section' | 'block_no' | 'block_part'>): string {
  return blockKey(ex.section ?? 'lift', ex.block_no ?? null, ex.block_part ?? null);
}

// Buckets a day's exercises into their blocks, in order within each block.
export function groupIntoBlocks<T extends SectionedExercise>(exercises: T[]): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const ex of [...exercises].sort((a, b) => a.sort_order - b.sort_order)) {
    const key = exerciseBlockKey(ex);
    const list = map.get(key);
    if (list) list.push(ex);
    else map.set(key, [ex]);
  }
  return map;
}

// The format a block is using: the first exercise that has one.
export function blockFormatOf(rows: Pick<SectionedExercise, 'block_format'>[] | undefined): string | null {
  return rows?.find((r) => r.block_format)?.block_format ?? null;
}

// Strong block 2 is split when any Strong block 2 row has a part.
export function strongBlock2IsSplit(exercises: Pick<SectionedExercise, 'section' | 'block_no' | 'block_part'>[]): boolean {
  return exercises.some((e) => e.section === 'strong' && e.block_no === 2 && !!e.block_part);
}

// Conditioning is a single 20-minute block when any of its rows sit in block 0.
export function conditioningIsSingle(exercises: Pick<SectionedExercise, 'section' | 'block_no'>[]): boolean {
  return exercises.some((e) => e.section === 'conditioning' && e.block_no === 0);
}

// True when a day uses anything other than the default Lift list, so older, plain days keep their
// plain look.
export function usesSections(exercises: Pick<SectionedExercise, 'section'>[]): boolean {
  return exercises.some((e) => e.section && e.section !== 'lift');
}

// Picker value for "move to": e.g. 'strong:2'.
export function parseBlockKey(key: string): { section: WorkoutSection; blockNo: 0 | 1 | 2 | null; part: BlockPart | null } {
  const [section, block, part] = key.split(':');
  return {
    section: section as WorkoutSection,
    blockNo: block === '2' ? 2 : block === '1' ? 1 : block === '0' ? 0 : null,
    part: part === 'upper' || part === 'lower' ? part : null,
  };
}
