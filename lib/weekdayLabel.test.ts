import { describe, expect, it } from 'vitest';
import { labelNamesWeekday } from './weekdayLabel';

describe('labelNamesWeekday (LB13: the day shown once)', () => {
  it('matches the full or short weekday name of the day it is on, whatever the case', () => {
    expect(labelNamesWeekday('Monday', 1)).toBe(true);
    expect(labelNamesWeekday(' mon ', 1)).toBe(true);
    expect(labelNamesWeekday('SATURDAY', 6)).toBe(true);
  });

  it('does not match another day, another name, or no day', () => {
    expect(labelNamesWeekday('Monday', 2)).toBe(false);
    expect(labelNamesWeekday('Lower A', 1)).toBe(false);
    expect(labelNamesWeekday('Monday strength', 1)).toBe(false);
    expect(labelNamesWeekday('Monday', null)).toBe(false);
    expect(labelNamesWeekday('Monday', 9)).toBe(false);
  });
});
