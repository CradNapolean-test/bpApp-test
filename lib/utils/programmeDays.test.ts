import { describe, expect, it } from 'vitest';
import { nextWeekCopy, sameWorkoutInWeek } from './programmeDays';

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

describe('nextWeekCopy (Add week)', () => {
  const week1 = [day('mon1', 1, 'Monday', 1), day('tue1', 1, 'Tuesday', 2), day('wed1', 1, 'Wednesday', 3)];

  it('copies the last week into the week after it', () => {
    const copy = nextWeekCopy(week1);
    expect(copy && { from: copy.from, to: copy.to, ids: copy.source.map((d) => d.id) }).toEqual({ from: 1, to: 2, ids: ['mon1', 'tue1', 'wed1'] });
  });

  it('a second Add week, read after the first one saved, makes week 3 from week 2 instead of a second week 2', () => {
    const afterFirst = [...week1, day('mon2', 2, 'Monday', 1), day('tue2', 2, 'Tuesday', 2), day('wed2', 2, 'Wednesday', 3)];
    const copy = nextWeekCopy(afterFirst);
    expect(copy?.to).toBe(3);
    expect(copy?.source.map((d) => d.id)).toEqual(['mon2', 'tue2', 'wed2']);
  });

  it('uses the last week even when the weeks are out of order or have a gap', () => {
    const days = [day('a', 3, 'Monday', 1), day('b', 1, 'Monday', 1), day('c', 3, 'Friday', 5)];
    const copy = nextWeekCopy(days);
    expect(copy && [copy.from, copy.to]).toEqual([3, 4]);
    expect(copy?.source.map((d) => d.id)).toEqual(['a', 'c']);
  });

  it('is null for a programme with no workouts yet', () => {
    expect(nextWeekCopy([])).toBeNull();
  });
});
