import { describe, expect, it } from 'vitest';
import { BROWSE_DAYS, EDIT_DAYS, canBrowseDate, canBrowseWeek, canEditDay, canEditFoodDay, changedFields } from './dayPatch';

// A stored day, as the form holds it.
const stored = {
  water: 2, bodyweight: 71.4, steps: 8200, sleep: 7, gym_session: true, hunger: 3, energy: 4, motivation: 4, stress: 2, period_started: false,
  notes: 'Felt good',
};

describe('changedFields (R14)', () => {
  it('editing one field produces a patch with only that field', () => {
    expect(changedFields(stored, { ...stored, sleep: 6.5 })).toEqual({ sleep: 6.5 });
    expect(changedFields(stored, { ...stored, notes: 'Felt good, sore legs' })).toEqual({ notes: 'Felt good, sore legs' });
  });

  it('is empty when nothing changed, so nothing is sent', () => {
    expect(changedFields(stored, { ...stored })).toEqual({});
  });

  it('never sends the fields the member did not touch, so a stale form cannot overwrite them', () => {
    // The member changes the gym toggle on a form whose other values are blank (an old day that was not loaded): only the toggle goes.
    const blank = { water: null, bodyweight: null, steps: null, sleep: null, gym_session: false, hunger: null, energy: null, motivation: null, stress: null, period_started: false, notes: null };
    expect(changedFields(blank, { ...blank, gym_session: true })).toEqual({ gym_session: true });
  });

  it('sends null for a value the member cleared', () => {
    expect(changedFields(stored, { ...stored, bodyweight: null })).toEqual({ bodyweight: null });
  });

  it('treats an empty note as no note, in both directions', () => {
    expect(changedFields({ ...stored, notes: null }, { ...stored, notes: '' })).toEqual({});
    expect(changedFields(stored, { ...stored, notes: '' })).toEqual({ notes: null });
  });

  it('ignores the food fields and anything else it does not own', () => {
    const withFood = { ...stored, protein: 100, calories: 2000 } as typeof stored;
    expect(changedFields(withFood, { ...withFood, protein: 5, calories: 1 } as typeof stored)).toEqual({});
  });

  it('can carry several changes made before one save', () => {
    expect(changedFields(stored, { ...stored, steps: 9000, hunger: 5 })).toEqual({ steps: 9000, hunger: 5 });
  });
});

describe('the edit and browse window (R14, D20)', () => {
  const today = '2026-10-15';

  it('lets a member change today and the last two weeks', () => {
    expect(canEditDay('2026-10-15', today)).toBe(true);
    expect(canEditDay('2026-10-01', today)).toBe(true); // exactly 14 days back
    expect(EDIT_DAYS).toBe(14);
  });

  it('locks older days, and days in the future', () => {
    expect(canEditDay('2026-09-30', today)).toBe(false);
    expect(canEditDay('2026-10-16', today)).toBe(false);
  });

  it('lets a member open a week while its last day is within 30 days', () => {
    // The week of Mon 21 Sep ends Sun 27 Sep: 18 days back.
    expect(canBrowseWeek('2026-09-21', today)).toBe(true);
    // The week of Mon 7 Sep ends Sun 13 Sep: 32 days back.
    expect(canBrowseWeek('2026-09-07', today)).toBe(false);
    expect(BROWSE_DAYS).toBe(30);
  });

  it('always allows the current week', () => {
    expect(canBrowseWeek('2026-10-12', today)).toBe(true);
  });
});

describe('canBrowseDate (FT1, D20)', () => {
  const today = '2026-10-15';
  it('lets a member look back 30 days, but not further or ahead', () => {
    expect(canBrowseDate('2026-10-15', today)).toBe(true);
    expect(canBrowseDate('2026-09-15', today)).toBe(true); // exactly 30 days
    expect(canBrowseDate('2026-09-14', today)).toBe(false);
    expect(canBrowseDate('2026-10-16', today)).toBe(false);
  });
});

describe('canEditFoodDay', () => {
  const today = '2026-10-16';
  it('is the normal edit window plus tomorrow', () => {
    expect(canEditFoodDay('2026-10-16', today)).toBe(true);
    expect(canEditFoodDay('2026-10-17', today)).toBe(true);
    expect(canEditFoodDay('2026-10-02', today)).toBe(true);
    expect(canEditFoodDay('2026-10-01', today)).toBe(false);
  });
  it('stops at tomorrow', () => {
    expect(canEditFoodDay('2026-10-18', today)).toBe(false);
  });
});
