import { describe, expect, it } from 'vitest';
import type { ExerciseLibraryRow } from '@/lib/data/types';
import {
  NO_EQUIPMENT,
  NO_FILTERS,
  NO_MOVEMENT,
  anyFilterOn,
  equipmentKey,
  equipmentOptions,
  filterLibrary,
  retiredStartIndex,
} from './exerciseLibraryList';

let n = 0;
function ex(name: string, over: Partial<ExerciseLibraryRow> = {}): ExerciseLibraryRow {
  n += 1;
  return {
    id: `ex-${n}`,
    created_by: 'coach',
    created_at: '2026-01-01T00:00:00Z',
    name,
    muscle_group: null,
    equipment: null,
    default_sets: null,
    default_reps: null,
    default_rpe: null,
    default_rest_seconds: null,
    tracking_type: 'weight_reps',
    video_url: null,
    image_url: null,
    instructions: null,
    notes: null,
    is_active: true,
    ...over,
  } as ExerciseLibraryRow;
}

const names = (list: { name: string }[]) => list.map((e) => e.name);

describe('filterLibrary', () => {
  const library = [
    ex('Squat', { muscle_group: 'Legs', equipment: 'Barbell', video_url: 'https://youtu.be/a' }),
    ex('bench press', { muscle_group: 'Push', equipment: 'barbell ' }),
    ex('Old Lunge', { muscle_group: 'Legs', equipment: 'Dumbbells', is_active: false }),
    ex('Air Bike', { muscle_group: 'Cardio', equipment: null, video_url: 'http://not-secure' }),
    ex('Archived Row', { muscle_group: 'Pull', equipment: 'Cable', is_active: false, video_url: 'https://youtu.be/b' }),
    ex('Plank', { muscle_group: null }),
  ];

  it('lists active exercises A-Z, then the retired ones A-Z (LB9)', () => {
    expect(names(filterLibrary(library, NO_FILTERS))).toEqual(['Air Bike', 'bench press', 'Plank', 'Squat', 'Archived Row', 'Old Lunge']);
  });

  it('filters active only and retired only', () => {
    expect(names(filterLibrary(library, { ...NO_FILTERS, status: 'active' }))).toEqual(['Air Bike', 'bench press', 'Plank', 'Squat']);
    expect(names(filterLibrary(library, { ...NO_FILTERS, status: 'retired' }))).toEqual(['Archived Row', 'Old Lunge']);
  });

  it('filters by equipment whatever the case and spaces (LB10), and by no equipment', () => {
    expect(names(filterLibrary(library, { ...NO_FILTERS, equipment: 'barbell' }))).toEqual(['bench press', 'Squat']);
    expect(names(filterLibrary(library, { ...NO_FILTERS, equipment: NO_EQUIPMENT }))).toEqual(['Air Bike', 'Plank']);
  });

  it('filters by movement, and by no movement', () => {
    expect(names(filterLibrary(library, { ...NO_FILTERS, movement: 'Legs' }))).toEqual(['Squat', 'Old Lunge']);
    expect(names(filterLibrary(library, { ...NO_FILTERS, movement: NO_MOVEMENT }))).toEqual(['Plank']);
  });

  it('keeps only exercises without a secure video link for No video', () => {
    expect(names(filterLibrary(library, { ...NO_FILTERS, noVideoOnly: true }))).toEqual(['Air Bike', 'bench press', 'Plank', 'Old Lunge']);
  });

  it('searches the name and the equipment, and combines with the other filters', () => {
    expect(names(filterLibrary(library, { ...NO_FILTERS, search: ' BAR ' }))).toEqual(['bench press', 'Squat']);
    expect(names(filterLibrary(library, { ...NO_FILTERS, search: 'row', status: 'retired' }))).toEqual(['Archived Row']);
    expect(filterLibrary(library, { ...NO_FILTERS, search: 'squat', movement: 'Push' })).toEqual([]);
  });

  it('does not change the list it is given', () => {
    const before = names(library);
    filterLibrary(library, NO_FILTERS);
    expect(names(library)).toEqual(before);
  });
});

describe('equipmentOptions', () => {
  it('groups spellings, shows the most used one, sorts A-Z and puts none last', () => {
    const opts = equipmentOptions([
      ex('a', { equipment: 'barbell' }),
      ex('b', { equipment: 'Barbell' }),
      ex('c', { equipment: ' Barbell  ' }),
      ex('d', { equipment: 'kettlebell' }),
      ex('e', { equipment: '' }),
      ex('f', { equipment: null }),
      ex('g', { equipment: 'Dumbbells' }),
    ]);
    expect(opts).toEqual([
      { key: 'barbell', label: 'Barbell', count: 3 },
      { key: 'dumbbells', label: 'Dumbbells', count: 1 },
      { key: 'kettlebell', label: 'kettlebell', count: 1 },
      { key: NO_EQUIPMENT, label: 'No equipment set', count: 2 },
    ]);
  });

  it('is empty for an empty library', () => {
    expect(equipmentOptions([])).toEqual([]);
  });

  it('normalises keys', () => {
    expect(equipmentKey('  Cable   Machine ')).toBe('cable machine');
    expect(equipmentKey(null)).toBe('');
  });
});

describe('retiredStartIndex and anyFilterOn', () => {
  it('marks where the retired ones start, only when active ones come first', () => {
    expect(retiredStartIndex([{ is_active: true }, { is_active: false }])).toBe(1);
    expect(retiredStartIndex([{ is_active: false }, { is_active: false }])).toBe(-1);
    expect(retiredStartIndex([{ is_active: true }, { is_active: undefined }])).toBe(-1);
  });

  it('knows when a filter is on', () => {
    expect(anyFilterOn(NO_FILTERS)).toBe(false);
    expect(anyFilterOn({ ...NO_FILTERS, search: '  ' })).toBe(false);
    expect(anyFilterOn({ ...NO_FILTERS, status: 'retired' })).toBe(true);
    expect(anyFilterOn({ ...NO_FILTERS, equipment: 'barbell' })).toBe(true);
  });
});
