import { describe, expect, it } from 'vitest';
import {
  LIBRARY_NAME_MAX,
  canAddToLibrary,
  cleanExerciseName,
  existingLibraryEntry,
  libraryNamePattern,
  libraryNameProblem,
  newLibraryEntry,
} from './libraryCreate';

describe('cleanExerciseName and libraryNameProblem', () => {
  it('stores the name trimmed with single spaces', () => {
    expect(cleanExerciseName('  Sled   drag ')).toBe('Sled drag');
  });
  it('refuses a blank or overlong name', () => {
    expect(libraryNameProblem('   ')).toMatch(/name/);
    expect(libraryNameProblem('x'.repeat(LIBRARY_NAME_MAX + 1))).toMatch(String(LIBRARY_NAME_MAX));
    expect(libraryNameProblem('x'.repeat(LIBRARY_NAME_MAX))).toBeNull();
    expect(libraryNameProblem(' Sled drag ')).toBeNull();
  });
});

describe('canAddToLibrary (mirrors "coaches add to exercise_library")', () => {
  it('lets a coach at a gym add', () => {
    expect(canAddToLibrary({ role: 'coach', gym_id: 'gym-1' })).toBe(true);
  });
  it('refuses a member, a coach with no gym, and nobody', () => {
    expect(canAddToLibrary({ role: 'client', gym_id: 'gym-1' })).toBe(false);
    expect(canAddToLibrary({ role: 'coach', gym_id: null })).toBe(false);
    expect(canAddToLibrary(null)).toBe(false);
    expect(canAddToLibrary(undefined)).toBe(false);
  });
});

describe('libraryNamePattern', () => {
  it('matches the words in order whatever the spacing', () => {
    expect(libraryNamePattern(' DB   press ')).toBe('DB%press');
    expect(libraryNamePattern('Run')).toBe('Run');
  });
  it('matches %, _ and \\ in the name as they are', () => {
    expect(libraryNamePattern('100% effort_row')).toBe('100\\%%effort\\_row');
    expect(libraryNamePattern('a\\b')).toBe('a\\\\b');
  });
});

describe('existingLibraryEntry', () => {
  const lib = [
    { id: '1', name: 'DB Press' },
    { id: '2', name: 'DB Bench Press' },
    { id: '3', name: 'Deadlift' },
    { id: '4', name: 'DEADLIFT' },
    { id: '5', name: 'Sled Push', is_active: false },
  ];
  it('hands back the one active exercise with the name, ignoring case and spacing', () => {
    expect(existingLibraryEntry(lib, ' db   PRESS')).toEqual({ kind: 'one', entry: lib[0] });
  });
  it('says when the name is there more than once', () => {
    expect(existingLibraryEntry(lib, 'deadlift')).toEqual({ kind: 'many' });
  });
  it('does not count a retired exercise or a longer name', () => {
    expect(existingLibraryEntry(lib, 'Sled push')).toEqual({ kind: 'none' });
    expect(existingLibraryEntry(lib, 'Bench Press')).toEqual({ kind: 'none' });
  });
});

describe('newLibraryEntry', () => {
  it('reads what the exercise records from its name', () => {
    expect(newLibraryEntry('Assault bike').tracking_type).toBe('calories');
    expect(newLibraryEntry('Sled drag').tracking_type).toBe('weight_distance');
    expect(newLibraryEntry('Side plank').tracking_type).toBe('time');
    expect(newLibraryEntry('Run 400m').tracking_type).toBe('distance_time');
  });
  it('records weight and reps when the name gives no confident guess', () => {
    expect(newLibraryEntry('Landmine press').tracking_type).toBe('weight_reps');
  });
  it('starts everything else blank, with the cleaned name', () => {
    const row = newLibraryEntry('  Landmine   press ');
    expect(row.name).toBe('Landmine press');
    expect(Object.entries(row).filter(([k]) => k !== 'name' && k !== 'tracking_type').every(([, v]) => v === null)).toBe(true);
    expect(row).not.toHaveProperty('created_by');
  });
});
