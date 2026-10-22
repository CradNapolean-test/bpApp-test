import { describe, expect, it } from 'vitest';
import { BROWSE_DAYS, EDIT_DAYS } from './dayPatch';
import { copyMessage, copySourceDays, copyTargetDays, dayLabel, rowsToCopy } from './diaryCopy';

const row = (food_id: string, portions: number, meal_section_id: string | null = 's1') => ({ food_id, portions, meal_section_id });

describe('the days that can be copied from and to', () => {
  it('copies into today and the last 14 days, newest first', () => {
    const days = copyTargetDays('2026-10-22');
    expect(days).toHaveLength(EDIT_DAYS + 1);
    expect(days[0]).toBe('2026-10-22');
    expect(days[1]).toBe('2026-10-21');
    expect(days[EDIT_DAYS]).toBe('2026-10-08');
  });

  it('copies from the last 30 days', () => {
    const days = copySourceDays('2026-10-22');
    expect(days).toHaveLength(BROWSE_DAYS + 1);
    expect(days[BROWSE_DAYS]).toBe('2026-09-22');
  });

  it('counts back across a month and year end', () => {
    expect(copyTargetDays('2027-01-02').slice(0, 4)).toEqual(['2027-01-02', '2027-01-01', '2026-12-31', '2026-12-30']);
  });
});

describe('dayLabel', () => {
  it('names today and yesterday, else the weekday and date', () => {
    expect(dayLabel('2026-10-22', '2026-10-22')).toBe('Today');
    expect(dayLabel('2026-10-21', '2026-10-22')).toBe('Yesterday');
    expect(dayLabel('2026-10-19', '2026-10-22')).toBe('Mon 19 Oct');
  });

  it('is lower case for today and yesterday inside a sentence', () => {
    expect(dayLabel('2026-10-22', '2026-10-22', true)).toBe('today');
    expect(dayLabel('2026-10-21', '2026-10-22', true)).toBe('yesterday');
    expect(dayLabel('2026-10-19', '2026-10-22', true)).toBe('Mon 19 Oct');
  });
});

describe('rowsToCopy', () => {
  it('keeps each row in its own meal by default', () => {
    expect(rowsToCopy([row('oats', 50, 's1'), row('rice', 150, 's2')], [])).toEqual([row('oats', 50, 's1'), row('rice', 150, 's2')]);
  });

  it('files everything into one meal when asked', () => {
    expect(rowsToCopy([row('rice', 150, 's2'), row('chicken', 120, 's2')], [], 's3')).toEqual([row('rice', 150, 's3'), row('chicken', 120, 's3')]);
  });

  it('leaves out what the day already has, so copying twice adds nothing', () => {
    const source = [row('oats', 50), row('milk', 200)];
    expect(rowsToCopy(source, source)).toEqual([]);
    expect(rowsToCopy(source, [row('oats', 50)])).toEqual([row('milk', 200)]);
  });

  it('compares against the meal the food lands in, not the one it came from', () => {
    // Lunch rice copied to Dinner: the rice already in Lunch on the target day does not count as there.
    expect(rowsToCopy([row('rice', 150, 's2')], [row('rice', 150, 's2')], 's3')).toEqual([row('rice', 150, 's3')]);
    expect(rowsToCopy([row('rice', 150, 's2')], [row('rice', 150, 's3')], 's3')).toEqual([]);
  });

  it('keeps the rest of the row (a Quick Add keeps its name and figures)', () => {
    const quick = { food_id: null, portions: 1, meal_section_id: 's1', quick_add_name: 'Burrito', quick_add_calories: 700, quick_add_protein: 30, quick_add_carbs: 80, quick_add_fat: 25 };
    expect(rowsToCopy([quick], [], 's2')).toEqual([{ ...quick, meal_section_id: 's2' }]);
  });
});

describe('copyMessage', () => {
  it('counts what was copied', () => {
    expect(copyMessage(4, 4, 'from yesterday')).toBe('4 items copied from yesterday');
    expect(copyMessage(1, 1, 'to Mon 19 Oct')).toBe('1 item copied to Mon 19 Oct');
  });

  it('says when some of it was already there', () => {
    expect(copyMessage(1, 3, 'from yesterday')).toBe('1 of 3 items copied from yesterday. The rest were already there.');
  });

  it('says when all of it was already there', () => {
    expect(copyMessage(0, 3, 'from yesterday')).toBe('All of it is already there, so nothing was copied.');
    expect(copyMessage(0, 1, 'from yesterday')).toBe('That item is already there, so nothing was copied.');
  });
});
