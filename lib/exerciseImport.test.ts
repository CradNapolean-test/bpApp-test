import { describe, expect, it } from 'vitest';
import { describeImport, MAX_IMPORT_ROWS, prepareExerciseImport, type ImportRow } from './exerciseImport';

const row = (name: string, extra: Partial<ImportRow> = {}): ImportRow => ({ name, equipment: null, video_url: null, image_url: null, ...extra });

describe('prepareExerciseImport', () => {
  it('skips rows already in the library (same name and equipment, ignoring case and spacing)', () => {
    const plan = prepareExerciseImport([row('Back Squat', { equipment: 'Barbell' }), row('Goblet squat', { equipment: 'Kettlebell' })], [
      { name: ' back squat ', equipment: 'barbell' },
    ]);
    expect(plan.rows.map((r) => r.name)).toEqual(['Goblet squat']);
    expect(plan.skippedDuplicates).toBe(1);
  });

  it('treats the same name with different equipment as a different exercise', () => {
    const plan = prepareExerciseImport([row('Row', { equipment: 'Cable' })], [{ name: 'Row', equipment: 'Dumbbell' }]);
    expect(plan.rows).toHaveLength(1);
  });

  it('skips repeats inside the file itself', () => {
    const plan = prepareExerciseImport([row('Plank'), row('plank'), row('PLANK ')], []);
    expect(plan.rows).toHaveLength(1);
    expect(plan.skippedDuplicates).toBe(2);
  });

  it('leaves out a row whose video or image link is not https', () => {
    const plan = prepareExerciseImport(
      [row('A', { video_url: 'http://example.com/a' }), row('B', { image_url: 'javascript:alert(1)' }), row('C', { video_url: 'https://example.com/c' }), row('D')],
      []
    );
    expect(plan.rows.map((r) => r.name)).toEqual(['C', 'D']);
    expect(plan.skippedBadLinks).toBe(2);
  });

  it('refuses a file of more than 500 rows without importing any of it', () => {
    const many = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => row('Exercise ' + i));
    const plan = prepareExerciseImport(many, []);
    expect(plan.tooMany).toBe(true);
    expect(plan.rows).toEqual([]);
    expect(prepareExerciseImport(many.slice(0, MAX_IMPORT_ROWS), []).tooMany).toBe(false);
  });
});

describe('describeImport', () => {
  it('says what was imported and what was skipped', () => {
    expect(describeImport({ rows: [row('a'), row('b')], skippedDuplicates: 0, skippedBadLinks: 0, tooMany: false })).toBe('Imported 2 exercises');
    expect(describeImport({ rows: [row('a')], skippedDuplicates: 3, skippedBadLinks: 1, tooMany: false })).toBe(
      "Imported 1 exercise. Skipped: 3 already in the library, 1 left out because their link doesn't start with https://."
    );
  });
  it('explains the row cap', () => {
    expect(describeImport({ rows: [], skippedDuplicates: 0, skippedBadLinks: 0, tooMany: true })).toMatch(/more than 500 rows/);
  });
});
