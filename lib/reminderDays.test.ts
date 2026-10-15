import { describe, expect, it } from 'vitest';
import { REMINDER_DAY_CHOICES, reminderDayOptions } from './reminderDays';

describe('reminderDayOptions', () => {
  it('is the usual list when the stored value is one of them, or off', () => {
    expect(reminderDayOptions(3)).toEqual(REMINDER_DAY_CHOICES);
    expect(reminderDayOptions(14)).toEqual(REMINDER_DAY_CHOICES);
    expect(reminderDayOptions(0)).toEqual(REMINDER_DAY_CHOICES);
  });

  it('adds a stored value that is not in the list, in order', () => {
    expect(reminderDayOptions(10)).toEqual([1, 2, 3, 4, 5, 6, 7, 10, 14]);
    expect(reminderDayOptions(30)).toEqual([1, 2, 3, 4, 5, 6, 7, 14, 30]);
  });

  it('ignores a nonsense value', () => {
    expect(reminderDayOptions(-2)).toEqual(REMINDER_DAY_CHOICES);
    expect(reminderDayOptions(Number.NaN)).toEqual(REMINDER_DAY_CHOICES);
  });
});
