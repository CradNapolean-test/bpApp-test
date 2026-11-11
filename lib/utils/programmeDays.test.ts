import { describe, expect, it } from 'vitest';
import { sameWorkoutInWeek } from './programmeDays';

const day = (id: string, week_num: number, day_label: string, day_position: number | null) => ({ id, week_num, day_label, day_position });

describe('sameWorkoutInWeek (LB3)', () => {
  const days = [day('m1', 1, 'Monday', 1), day('m2', 2, 'Monday', 1), day('t2', 2, 'Tuesday', 2), day('x1', 1, 'Extra', null), day('x2', 2, 'extra ', null)];

  it('finds next week\'s workout on the same weekday', () => {
    expect(sameWorkoutInWeek(days, days[0], 2).map((d) => d.id)).toEqual(['m2']);
  });
  it('matches by name only when neither has a weekday', () => {
    expect(sameWorkoutInWeek(days, days[3], 2).map((d) => d.id)).toEqual(['x2']);
  });
  it('finds nothing when next week has no such workout', () => {
    expect(sameWorkoutInWeek(days, days[0], 3)).toEqual([]);
    expect(sameWorkoutInWeek(days, day('w1', 1, 'Wednesday', 3), 2)).toEqual([]);
  });
});
