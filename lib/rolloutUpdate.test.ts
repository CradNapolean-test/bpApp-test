import { describe, expect, it } from 'vitest';
import { NOTHING_TO_UPDATE, rolloutUpdateConfirmation, rolloutUpdateDone, templateInUseLabel } from './rolloutUpdate';

const counts = { members: 17, daysRemoved: 34, daysAdded: 36, daysKept: 0 };

describe('templateInUseLabel', () => {
  it('adds up the members still on each rollout', () => {
    expect(templateInUseLabel([{ members: 4 }, { members: 13 }])).toBe('In use by 17 members');
    expect(templateInUseLabel([{ members: 1 }])).toBe('In use by 1 member');
  });
  it('says nothing when nobody is on it', () => {
    expect(templateInUseLabel([])).toBeNull();
    expect(templateInUseLabel([{ members: 0 }])).toBeNull();
  });
});

describe('rolloutUpdateConfirmation', () => {
  it('names how many members it affects and what stays', () => {
    const c = rolloutUpdateConfirmation('November Weeks 9-11', counts)!;
    expect(c.title).toBe('Apply your changes to 17 members?');
    expect(c.body).toContain('“November Weeks 9-11”');
    expect(c.body).toContain('36 workouts, replacing 34');
    expect(c.body).toContain('This week and earlier weeks don’t change.');
    expect(c.body).not.toContain('already started');
    expect(c.confirmLabel).toBe('Apply to 17 members');
  });
  it('mentions workouts kept because a member has started them', () => {
    expect(rolloutUpdateConfirmation('X', { ...counts, daysKept: 1 })!.body).toContain('1 workout a member has already started is kept as it is.');
    expect(rolloutUpdateConfirmation('X', { ...counts, daysKept: 2 })!.body).toContain('2 workouts a member has already started are kept as they are.');
  });
  it('is null when nobody has a week still to come', () => {
    expect(rolloutUpdateConfirmation('X', { members: 0, daysRemoved: 0, daysAdded: 0, daysKept: 0 })).toBeNull();
  });
});

describe('rolloutUpdateDone', () => {
  it('says who was updated, or that nothing changed', () => {
    expect(rolloutUpdateDone(counts)).toBe('Updated for 17 members');
    expect(rolloutUpdateDone({ members: 0, daysRemoved: 0, daysAdded: 0, daysKept: 0 })).toBe(NOTHING_TO_UPDATE);
  });
});
