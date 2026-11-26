import { describe, expect, it } from 'vitest';
import { classNameChoices, classNameKey, matchClassName, nearClassName, newClassNameQuestion, tidyClassName } from './classNameMatch';

const CHOICES = ['HIIT', 'Strength', 'Strength Club', 'Yoga'];

describe('tidyClassName and classNameKey', () => {
  it('trims and keeps one space between words', () => {
    expect(tidyClassName('  Strength   Club ')).toBe('Strength Club');
    expect(tidyClassName('Strength\tClub')).toBe('Strength Club');
  });

  it('compares without case or extra spaces', () => {
    expect(classNameKey(' strength  CLUB')).toBe(classNameKey('Strength Club'));
    expect(classNameKey('Strength')).not.toBe(classNameKey('Strength Club'));
  });
});

describe('classNameChoices', () => {
  it('lists each class once, A to Z', () => {
    expect(classNameChoices(['Yoga', 'HIIT', 'Yoga', 'Strength'])).toEqual(['HIIT', 'Strength', 'Yoga']);
  });

  it('folds spellings that differ only in case or spaces into the one most sessions use', () => {
    expect(classNameChoices(['Strength', 'strength ', 'Strength', 'STRENGTH'])).toEqual(['Strength']);
    expect(classNameChoices(['strength', 'strength', 'Strength'])).toEqual(['strength']);
  });

  it('leaves blank names out', () => {
    expect(classNameChoices(['', '   ', 'Yoga'])).toEqual(['Yoga']);
  });
});

describe('matchClassName (CS10)', () => {
  it('is the existing class, ignoring case and extra spaces', () => {
    expect(matchClassName('strength', CHOICES)).toBe('Strength');
    expect(matchClassName('  STRENGTH  ', CHOICES)).toBe('Strength');
    expect(matchClassName('strength   club', CHOICES)).toBe('Strength Club');
    expect(matchClassName('hiit', CHOICES)).toBe('HIIT');
  });

  it('is null for a name that is new, or blank', () => {
    expect(matchClassName('Strenght', CHOICES)).toBeNull();
    expect(matchClassName('Boxing', CHOICES)).toBeNull();
    expect(matchClassName('   ', CHOICES)).toBeNull();
  });
});

describe('nearClassName', () => {
  it('spots a slip of an existing name', () => {
    expect(nearClassName('Strenght', CHOICES)).toBe('Strength');
    expect(nearClassName('Strengh', CHOICES)).toBe('Strength');
    expect(nearClassName('HIT', CHOICES)).toBe('HIIT');
    expect(nearClassName('yogo', CHOICES)).toBe('Yoga');
  });

  it('says nothing for a name that is really different, or already a class', () => {
    expect(nearClassName('Boxing', CHOICES)).toBeNull();
    expect(nearClassName('Spin', CHOICES)).toBeNull();
    expect(nearClassName('strength', CHOICES)).toBeNull();
  });
});

describe('newClassNameQuestion', () => {
  it('asks before a new name, and points at a near one', () => {
    const q = newClassNameQuestion('Strenght', CHOICES)!;
    expect(q.title).toBe('Add “Strenght” as a new class?');
    expect(q.body).toContain('It looks like Strength, which you already have.');
    expect(q.confirmLabel).toBe('Add new class');
  });

  it('lists the gym’s classes when nothing is near', () => {
    expect(newClassNameQuestion('  Boxing ', CHOICES)!.body).toContain('Your classes now: HIIT, Strength, Strength Club, Yoga.');
    expect(newClassNameQuestion('  Boxing ', CHOICES)!.title).toBe('Add “Boxing” as a new class?');
  });

  it('asks nothing for an existing class, a blank name, or a gym with no classes yet', () => {
    expect(newClassNameQuestion('strength ', CHOICES)).toBeNull();
    expect(newClassNameQuestion('', CHOICES)).toBeNull();
    expect(newClassNameQuestion('Boxing', [])).toBeNull();
  });
});
