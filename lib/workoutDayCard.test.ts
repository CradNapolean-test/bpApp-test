import { describe, expect, it } from 'vitest';
import { mainLiftNames } from './workoutDayCard';
import { labelNamesWeekday } from './weekdayLabel';

const row = (name: string, section: string | null, sort_order: number, tracking_type: string | null = 'weight_reps', block_type = 'exercise') => ({
  name,
  section,
  sort_order,
  tracking_type,
  block_type,
});

describe('the coach day card (CV12)', () => {
  it('names the Lift, not the warm-up', () => {
    const day = [
      row('BIKE', 'warmup', 0, 'calories'),
      row('SA Banded Chest Press', 'warmup', 1),
      row('Back Squat', 'lift', 2),
      row('DB Bent Over Row', 'lift', 3),
      row('KB Swing', 'strong', 4),
    ];
    expect(mainLiftNames(day)).toEqual(['Back Squat', 'DB Bent Over Row']);
  });

  it('a day built without sections (all in Lift, warm-up first) still names its loaded lifts, in the order they are done', () => {
    const day = [row('SKI ERG', 'lift', 0, 'calories'), row('Plank', 'lift', 1, 'time'), row('Bench Press', 'lift', 2), row('Deadlift', 'lift', 3)];
    expect(mainLiftNames(day)).toEqual(['Bench Press', 'Deadlift']);
    // Rows from before sections or tracking types count as Lift and weight x reps.
    expect(mainLiftNames([row('Row', null, 1, null), row('Bike', null, 0, 'calories')])).toEqual(['Bike', 'Row']);
  });

  it('tops up with the rest of the Lift when it has fewer loaded lifts than names wanted', () => {
    expect(mainLiftNames([row('Chin Up', 'lift', 0, 'reps'), row('Back Squat', 'lift', 1)])).toEqual(['Chin Up', 'Back Squat']);
  });

  it('falls back to Strong and Conditioning, then the warm-up, and skips notes and headings', () => {
    expect(mainLiftNames([row('Bike', 'warmup', 0, 'calories'), row('Erg', 'conditioning', 2, 'calories'), row('KB Swing', 'strong', 1)])).toEqual([
      'KB Swing',
      'Erg',
    ]);
    expect(mainLiftNames([row('Bike', 'warmup', 0, 'calories'), row('Note', 'lift', 1, null, 'note')], 1)).toEqual(['Bike']);
    expect(mainLiftNames([])).toEqual([]);
  });

  it('shows the weekday once: a card named after its weekday drops the tile word', () => {
    expect(labelNamesWeekday('Monday', 1)).toBe(true);
    expect(labelNamesWeekday('Push day', 1)).toBe(false);
  });
});
