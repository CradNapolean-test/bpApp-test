import type { ExerciseLibraryRow } from '@/lib/data/types';

// The coach's exercise list (Library > Exercises, LB5, LB9, LB10): which exercises show, in what order, and the equipment the filter offers.

export type StatusFilter = 'all' | 'active' | 'retired';

// The equipment filter's choice for exercises with no equipment written in.
export const NO_EQUIPMENT = '__none__';
// The movement filter's choice for exercises with no movement picked.
export const NO_MOVEMENT = '__none__';

export interface LibraryFilters {
  search: string;
  // '' = any movement; a value of MUSCLE_GROUPS, or NO_MOVEMENT
  movement: string;
  // '' = any equipment; an equipmentKey, or NO_EQUIPMENT
  equipment: string;
  status: StatusFilter;
  noVideoOnly: boolean;
}

export const NO_FILTERS: LibraryFilters = { search: '', movement: '', equipment: '', status: 'all', noVideoOnly: false };

export const hasVideo = (ex: Pick<ExerciseLibraryRow, 'video_url'>) => !!ex.video_url?.startsWith('https://');
export const isRetired = (ex: Pick<ExerciseLibraryRow, 'is_active'>) => ex.is_active === false;

// Equipment is typed in freely ("Barbell", "barbell ", "BARBELL"), so the filter groups spellings that differ only in case and spaces.
export function equipmentKey(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true });

// What the equipment filter offers: each kind once, shown as the spelling most exercises use (the first in A-Z order on a tie), A-Z,
// with "no equipment" last when some have none.
export function equipmentOptions(exercises: Pick<ExerciseLibraryRow, 'equipment'>[]): { key: string; label: string; count: number }[] {
  const groups = new Map<string, Map<string, number>>();
  let none = 0;
  for (const ex of exercises) {
    const key = equipmentKey(ex.equipment);
    if (!key) {
      none += 1;
      continue;
    }
    const spelling = (ex.equipment ?? '').trim().replace(/\s+/g, ' ');
    const spellings = groups.get(key) ?? new Map<string, number>();
    spellings.set(spelling, (spellings.get(spelling) ?? 0) + 1);
    groups.set(key, spellings);
  }
  const options = Array.from(groups, ([key, spellings]) => {
    // on a tie, a spelling with capitals ("Barbell" over "barbell")
    const capitals = (x: string) => (x === x.toLowerCase() ? 1 : 0);
    const ranked = Array.from(spellings).sort((a, b) => b[1] - a[1] || capitals(a[0]) - capitals(b[0]) || a[0].localeCompare(b[0]));
    return { key, label: ranked[0][0], count: Array.from(spellings.values()).reduce((n, c) => n + c, 0) };
  }).sort((a, b) => a.label.localeCompare(b.label, 'en', { sensitivity: 'base' }));
  if (none > 0) options.push({ key: NO_EQUIPMENT, label: 'No equipment set', count: none });
  return options;
}

export function anyFilterOn(f: LibraryFilters): boolean {
  return f.search.trim() !== '' || f.movement !== '' || f.equipment !== '' || f.status !== 'all' || f.noVideoOnly;
}

// The exercises the filters let through, A-Z, with every retired one after the active ones (LB9: retired exercises sat mixed in).
// Search looks at the name and the equipment, as before.
export function filterLibrary<T extends ExerciseLibraryRow>(exercises: T[], f: LibraryFilters): T[] {
  const q = f.search.trim().toLowerCase();
  const kept = exercises.filter((ex) => {
    if (f.status === 'active' && isRetired(ex)) return false;
    if (f.status === 'retired' && !isRetired(ex)) return false;
    if (f.movement === NO_MOVEMENT ? !!ex.muscle_group : f.movement !== '' && ex.muscle_group !== f.movement) return false;
    if (f.equipment === NO_EQUIPMENT ? equipmentKey(ex.equipment) !== '' : f.equipment !== '' && equipmentKey(ex.equipment) !== f.equipment) {
      return false;
    }
    if (f.noVideoOnly && hasVideo(ex)) return false;
    if (q && !ex.name.toLowerCase().includes(q) && !(ex.equipment ?? '').toLowerCase().includes(q)) return false;
    return true;
  });
  const active = kept.filter((ex) => !isRetired(ex)).sort(byName);
  const retired = kept.filter(isRetired).sort(byName);
  return [...active, ...retired];
}

// Where the "Retired" heading goes in a list from filterLibrary: the index of the first retired exercise, or -1 when there is none
// (or when every exercise shown is retired, so no heading is needed to set them apart).
export function retiredStartIndex(list: Pick<ExerciseLibraryRow, 'is_active'>[]): number {
  const first = list.findIndex(isRetired);
  return first > 0 ? first : -1;
}
