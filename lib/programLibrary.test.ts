import { describe, expect, it } from 'vitest';
import { libraryIdsOf } from './programLibrary';

const program = (days: { exercises: (string | null)[] }[]) =>
  ({
    workout_program_days: days.map((d) => ({ workout_exercises: d.exercises.map((exercise_library_id) => ({ exercise_library_id })) })),
  }) as never;

describe('libraryIdsOf (R13)', () => {
  it('lists each library entry the programmes use once, across days and programmes', () => {
    const ids = libraryIdsOf([program([{ exercises: ['squat', 'bench', null] }, { exercises: ['squat', 'row'] }]), program([{ exercises: ['bench', 'rdl'] }])]);
    expect(ids.sort()).toEqual(['bench', 'rdl', 'row', 'squat']);
  });

  it('skips exercises typed in by hand (no library entry)', () => {
    expect(libraryIdsOf([program([{ exercises: [null, null] }])])).toEqual([]);
  });

  it('is empty for a member with no programme', () => {
    expect(libraryIdsOf([])).toEqual([]);
  });
});
