import { describe, expect, it } from 'vitest';

import { DISABLEABLE_SCREENS, memberAreas, tierScreens, toDisabledScreenSet, toEffectiveDisabledScreenSet } from './screens';

describe('toDisabledScreenSet', () => {
  it('keeps the screens a coach can switch off', () => {
    expect([...toDisabledScreenSet(['Workout', 'Overview'])].sort()).toEqual(['Overview', 'Workout']);
  });

  it('never lets a stray or core screen be hidden', () => {
    expect([...toDisabledScreenSet(['Today', 'Account', 'Credits', 'Messages', 'Nonsense', 'Workout'])]).toEqual(['Workout']);
  });
});

describe('toEffectiveDisabledScreenSet', () => {
  it('with no tier limit, only the coach toggles apply', () => {
    expect([...toEffectiveDisabledScreenSet(['Forms'], null)]).toEqual(['Forms']);
  });

  it('a tier hides every switchable screen it does not include', () => {
    const d = toEffectiveDisabledScreenSet([], ['Workout', 'Food Tracking']);
    expect(d.has('Workout')).toBe(false);
    expect(d.has('Food Tracking')).toBe(false);
    expect(d.has('Overview')).toBe(true);
    expect(d.has('Body Scans')).toBe(true);
    expect(d.size).toBe(DISABLEABLE_SCREENS.length - 2);
  });

  it('a coach toggle can take away more but never restore what the tier excludes', () => {
    const d = toEffectiveDisabledScreenSet(['Workout'], ['Workout', 'Overview']);
    expect(d.has('Workout')).toBe(true); // the coach switched it off
    expect(d.has('Overview')).toBe(false);
    expect(d.has('Forms')).toBe(true); // the tier excludes it, and nothing the coach did brings it back
  });

  it('an empty tier list means the tier includes none of the switchable screens', () => {
    expect(toEffectiveDisabledScreenSet([], []).size).toBe(DISABLEABLE_SCREENS.length);
  });
});

describe('memberAreas', () => {
  const none = new Set<never>();

  it('shows everything when nothing is switched off', () => {
    expect(memberAreas(none)).toEqual({ food: true, workouts: true, overview: true, strength: true, photos: true, scans: true, progress: true, forms: true, weeklyLog: true, education: true, recipes: true, mealPlanner: true, activity: true });
  });

  it('hides Resources, Recipes, the Meal Planner and Activity when the coach switches them off', () => {
    const a = memberAreas(toDisabledScreenSet(['Education', 'Recipes', 'Meal Planner', 'Activity']));
    expect(a).toMatchObject({ education: false, recipes: false, mealPlanner: false, activity: false, food: true, forms: true });
  });

  it('hides Forms and the daily check-in when the coach switches them off', () => {
    const a = memberAreas(toDisabledScreenSet(['Forms', 'Weekly Log']));
    expect(a.forms).toBe(false);
    expect(a.weeklyLog).toBe(false);
    expect(a.food).toBe(true);
  });

  it('hides a tab whose screen is off', () => {
    const a = memberAreas(toDisabledScreenSet(['Food Tracking', 'Workout']));
    expect(a.food).toBe(false);
    expect(a.workouts).toBe(false);
    expect(a.progress).toBe(true);
  });

  it('hides Progress only when all three of its parts are off', () => {
    expect(memberAreas(toDisabledScreenSet(['Overview', 'Progress & Photos'])).progress).toBe(true);
    // Strength is a Progress segment too, so Progress stays while it is on.
    const all = memberAreas(toDisabledScreenSet(['Overview', 'Progress & Photos', 'Body Scans']));
    expect(all).toMatchObject({ overview: false, photos: false, scans: false, strength: true, progress: true });
    const none = memberAreas(toDisabledScreenSet(['Overview', 'Strength', 'Progress & Photos', 'Body Scans']));
    expect(none).toMatchObject({ strength: false, progress: false });
  });

  it('a member on the photo diary keeps the Food tab (the diary itself cannot be switched off)', () => {
    expect(memberAreas(toDisabledScreenSet(['Food Tracking']), 'photo_diary').food).toBe(true);
    expect(memberAreas(toDisabledScreenSet(['Food Tracking']), 'manual_import').food).toBe(false);
  });
});

describe('tierScreens', () => {
  it('reads the membership package, and means no limit without one', () => {
    expect(tierScreens({ package: { included_screens: ['Workout'] } })).toEqual(['Workout']);
    expect(tierScreens({ package: { included_screens: null } })).toBeNull();
    expect(tierScreens({ package: null })).toBeNull();
    expect(tierScreens(null)).toBeNull();
    expect(tierScreens(undefined)).toBeNull();
  });
});
