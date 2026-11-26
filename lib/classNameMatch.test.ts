import { describe, expect, it } from 'vitest';
import { classNameChoices, classNameKey, matchClassName, nearClassName, newClassNameQuestion, resolveClassName, tidyClassName } from './classNameMatch';

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

  it('on a tie, takes the spelling with a capital first', () => {
    expect(classNameChoices(['Strength', 'strength'])).toEqual(['Strength']);
    expect(classNameChoices(['strength', 'Strength'])).toEqual(['Strength']);
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

  it('says nothing for a different first letter, or an existing name plus a word', () => {
    expect(nearClassName('Jump', ['Pump'])).toBeNull();
    expect(nearClassName('Fox', ['Box'])).toBeNull();
    expect(nearClassName('More', ['Core'])).toBeNull();
    expect(nearClassName('Strength 2', ['Strength'])).toBeNull();
    expect(nearClassName('Yoga', ['Yoga Flow'])).toBeNull();
  });
});

describe('resolveClassName: what the session form saves', () => {
  const OTHERS = ['Strength', 'Strength', 'HIIT', 'Yoga'];

  it('a new session: an existing class whatever its case or spacing, otherwise a new name with a question', () => {
    expect(resolveClassName('  strength ', OTHERS, null)).toMatchObject({ name: 'Strength', existing: 'Strength', near: null, question: null });
    const typo = resolveClassName('Strenght', OTHERS, null);
    expect(typo).toMatchObject({ name: 'Strenght', existing: null, near: 'Strength' });
    expect(typo.question?.title).toBe('Add “Strenght” as a new class?');
  });

  it('an edit that keeps the class keeps the stored spelling, not the picker’s', () => {
    expect(resolveClassName('Strength', OTHERS, 'strength ')).toMatchObject({ name: 'strength ', existing: 'strength ', question: null });
  });

  it('fixing the only session of a misspelt class is not met with its own old name', () => {
    const fix = resolveClassName('Strength', ['HIIT', 'Yoga'], 'Strenght');
    expect(fix).toMatchObject({ name: 'Strength', existing: null, near: null });
    expect(fix.question?.body).not.toContain('Strenght');
  });

  it('moving a session to another existing class asks nothing', () => {
    expect(resolveClassName('hiit', OTHERS, 'Strength')).toMatchObject({ name: 'HIIT', existing: 'HIIT', question: null });
  });

  it('the gym’s first class asks nothing', () => {
    expect(resolveClassName('Strength', [], null)).toMatchObject({ name: 'Strength', existing: null, question: null });
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
