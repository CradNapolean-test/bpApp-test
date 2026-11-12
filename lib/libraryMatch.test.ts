import { describe, expect, it } from 'vitest';
import { exerciseNameKey, findLibraryMatch } from './libraryMatch';

const library = [
  { id: 'bench', name: 'BENCH PRESS' },
  { id: 'dl1', name: 'Deadlift' },
  { id: 'dl2', name: 'DEADLIFT' },
  { id: 'old', name: 'OLD MOVE', is_active: false },
  { id: 'ts', name: "INCLINE T's" },
];

describe('exerciseNameKey', () => {
  it('ignores case and extra spaces', () => {
    expect(exerciseNameKey('  Bench   Press ')).toBe('bench press');
  });
});

describe('findLibraryMatch', () => {
  it('finds the library exercise with the same name, whatever the case and spacing', () => {
    expect(findLibraryMatch(library, 'bench press')?.id).toBe('bench');
    expect(findLibraryMatch(library, ' Bench  Press')?.id).toBe('bench');
    expect(findLibraryMatch(library, "incline t's")?.id).toBe('ts');
  });
  it('only matches the whole name', () => {
    expect(findLibraryMatch(library, 'bench')).toBeNull();
    expect(findLibraryMatch(library, 'bench presses')).toBeNull();
    expect(findLibraryMatch(library, 'DB BENCH PRESS')).toBeNull();
  });
  it('picks nothing when two library exercises share the name', () => {
    expect(findLibraryMatch(library, 'deadlift')).toBeNull();
  });
  it('skips exercises taken out of the library, and empty names', () => {
    expect(findLibraryMatch(library, 'old move')).toBeNull();
    expect(findLibraryMatch(library, '   ')).toBeNull();
  });
});
