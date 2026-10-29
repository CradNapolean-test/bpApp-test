// How a session is laid out: Warm-up, Lift (12 min), then Strong or Conditioning (20 min, two
// 10-minute blocks). Shared by the coach's builder and the member's workout screen.

export type WorkoutSection = 'warmup' | 'lift' | 'strong' | 'conditioning';

// Strong block 2 can be split into an upper body list and a lower body list; Conditioning block 2 into a
// Breath list and a Burn list. The member picks one of the two.
export type BlockPart = 'upper' | 'lower' | 'breath' | 'burn';

export const PART_TITLE: Record<BlockPart, string> = { upper: 'Upper body', lower: 'Lower body', breath: 'Breath', burn: 'Burn' };

export const STRONG_PARTS: BlockPart[] = ['upper', 'lower'];
export const CONDITIONING_PARTS: BlockPart[] = ['breath', 'burn'];

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
  // Only block 2 splits into parts: Upper / Lower for Strong, Breath / Burn for Conditioning.
  if (b === 2 && part && ((section === 'strong' && STRONG_PARTS.includes(part)) || (section === 'conditioning' && CONDITIONING_PARTS.includes(part)))) {
    return `${section}:${b}:${part}`;
  }
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

// Conditioning block 2 is split when any Conditioning block 2 row has a part (Breath / Burn).
export function conditioningBlock2IsSplit(exercises: Pick<SectionedExercise, 'section' | 'block_no' | 'block_part'>[]): boolean {
  return exercises.some((e) => e.section === 'conditioning' && e.block_no === 2 && !!e.block_part);
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

export interface SlotOption {
  key: string;
  label: string;
  section: 'strong' | 'conditioning';
}

function optionFor(key: string): SlotOption {
  const { section, blockNo, part } = parseBlockKey(key);
  const base = SECTION_TITLE[section];
  const label = part ? `${base} · ${PART_TITLE[part]}` : blockNo === 0 ? `${base} · 20 min` : base;
  return { key, label, section: section as 'strong' | 'conditioning' };
}

// What a member can pick for each of the two 10-minute slots, given which blocks have exercises.
//  - slot 1: Strong block 1, Conditioning block 1, or the single 20-minute Conditioning block.
//  - slot 2: Strong block 2 (or its Upper / Lower halves) or Conditioning block 2. If they took the
//    single 20-minute Conditioning block in slot 1, it covers slot 2 as well (`locked`).
export function slotOptions(
  present: Set<string>,
  slot: 1 | 2,
  slot1Choice: string | null
): { options: SlotOption[]; locked: string | null } {
  if (slot === 1) {
    return { options: ['strong:1', 'conditioning:0', 'conditioning:1'].filter((k) => present.has(k)).map(optionFor), locked: null };
  }
  if (slot1Choice === 'conditioning:0') return { options: [], locked: 'conditioning:0' };
  const keys = ['strong:2', 'strong:2:upper', 'strong:2:lower'].filter((k) => present.has(k));
  // Taking the single 20-minute block means taking it from the start, so it is not offered mid-way.
  if (!present.has('conditioning:0')) keys.push(...['conditioning:2', 'conditioning:2:breath', 'conditioning:2:burn'].filter((k) => present.has(k)));
  return { options: keys.map(optionFor), locked: null };
}

// The blocks a member's choices put them in, in order.
export function chosenBlockKeys(slot1: string | null, slot2: string | null): string[] {
  if (slot1 === 'conditioning:0') return [slot1];
  return [slot1, slot2].filter((k): k is string => !!k);
}

// "Strong, then Conditioning", and whether they switched between the two.
export function describeChoices(slot1: string | null, slot2: string | null): { text: string; switched: boolean } | null {
  if (!slot1) return null;
  if (slot1 === 'conditioning:0') return { text: 'Conditioning (one 20-minute block)', switched: false };
  const a = optionFor(slot1);
  if (!slot2) return { text: `${a.label} (block 1 only so far)`, switched: false };
  const b = optionFor(slot2);
  return { text: `${a.label}, then ${b.label}`, switched: a.section !== b.section };
}

// Whether an exercise shows in a member's workout: Warm-up and Lift always; a Strong or Conditioning
// exercise only once its block is one they chose. Days that don't use sections show everything.
export function exerciseIsVisible(
  ex: Pick<SectionedExercise, 'section' | 'block_no' | 'block_part'>,
  daySectioned: boolean,
  chosen: string[]
): boolean {
  if (!daySectioned) return true;
  const section = ex.section ?? 'lift';
  if (section === 'warmup' || section === 'lift') return true;
  return chosen.includes(exerciseBlockKey(ex));
}

// Picker value for "move to": e.g. 'strong:2'.
export function parseBlockKey(key: string): { section: WorkoutSection; blockNo: 0 | 1 | 2 | null; part: BlockPart | null } {
  const [section, block, part] = key.split(':');
  return {
    section: section as WorkoutSection,
    blockNo: block === '2' ? 2 : block === '1' ? 1 : block === '0' ? 0 : null,
    part: part === 'upper' || part === 'lower' || part === 'breath' || part === 'burn' ? part : null,
  };
}
