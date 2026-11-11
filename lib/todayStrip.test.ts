import { describe, expect, it } from 'vitest';
import { foodLeft, foodStripText, workoutStripText } from './todayStrip';

const target = { calories: 2000, protein: 150 };

describe('foodLeft', () => {
  it('takes what is eaten from the day target', () => {
    expect(foodLeft({ mode: 'full_tracking', held: false, target, eaten: { calories: 759.6, protein: 88.4 } })).toEqual({
      kind: 'numbers',
      caloriesLeft: 1240,
      proteinLeft: 62,
    });
  });
  it('never gives a photo-diary member calorie numbers, even with a target', () => {
    expect(foodLeft({ mode: 'photo_diary', held: false, target, eaten: { calories: 0, protein: 0 } })).toEqual({ kind: 'photo_diary' });
  });
  it('says the plan is being set up while the coach has not checked it', () => {
    expect(foodLeft({ mode: 'full_tracking', held: true, target: null, eaten: { calories: 0, protein: 0 } })).toEqual({ kind: 'held' });
  });
  it('uses a target of the member own even while the plan waits', () => {
    expect(foodLeft({ mode: 'full_tracking', held: true, target, eaten: { calories: 0, protein: 0 } }).kind).toBe('numbers');
  });
  it('has no numbers without a target', () => {
    expect(foodLeft({ mode: 'manual_import', held: false, target: null, eaten: { calories: 0, protein: 0 } })).toEqual({ kind: 'no_target' });
  });
});

describe('foodStripText', () => {
  it('shows calories and protein left', () => {
    expect(foodStripText({ kind: 'numbers', caloriesLeft: 1240, proteinLeft: 62 })).toEqual({
      label: 'Left today',
      title: '1,240 kcal',
      detail: '62 g protein',
      over: false,
    });
  });
  it('says how far over, and when protein is done', () => {
    expect(foodStripText({ kind: 'numbers', caloriesLeft: -120, proteinLeft: -5 })).toEqual({
      label: 'Left today',
      title: '120 kcal over',
      detail: 'Protein target hit',
      over: true,
    });
    expect(foodStripText({ kind: 'numbers', caloriesLeft: 0, proteinLeft: 0 })).toMatchObject({ title: '0 kcal', detail: 'Protein target hit', over: false });
  });
  it('has words, not numbers, for the other cases', () => {
    expect(foodStripText({ kind: 'photo_diary' }).title).toBe('Photo diary');
    expect(foodStripText({ kind: 'held' }).title).toBe('Plan being set up');
    expect(foodStripText({ kind: 'no_target' }).title).toBe('No targets yet');
  });
});

describe('workoutStripText', () => {
  const day = { status: 'workout' as const, dayLabel: 'Upper A', highlights: ['Bench Press', 'Pull Ups'], exerciseCount: 6, weekNum: 3, done: false };
  it('names the day and its main lifts', () => {
    expect(workoutStripText(day)).toEqual({ label: "Today's workout", title: 'Upper A', detail: 'Bench Press · Pull Ups' });
  });
  it('leads with the lifts when the day has no name', () => {
    expect(workoutStripText({ ...day, dayLabel: '  ' })).toMatchObject({ title: 'Bench Press · Pull Ups', detail: 'Week 3' });
    expect(workoutStripText({ ...day, highlights: [] })).toMatchObject({ title: 'Upper A', detail: '6 exercises' });
    expect(workoutStripText({ ...day, dayLabel: null, highlights: [] })).toMatchObject({ title: 'Workout', detail: 'Week 3' });
  });
  it('says when it is done today', () => {
    expect(workoutStripText({ ...day, done: true })?.detail).toBe('Done today ✓ · Bench Press · Pull Ups');
  });
  it('covers rest days, a finished programme and one with no start date', () => {
    expect(workoutStripText({ status: 'rest_day', weekNum: 2 })).toMatchObject({ title: 'Rest day', detail: 'Week 2 · see the week' });
    expect(workoutStripText({ status: 'ended' })?.title).toBe('Programme finished');
    expect(workoutStripText({ status: 'no_start_date', programName: 'Block 1' })).toMatchObject({ title: 'Block 1', detail: 'No start date yet: ask your coach' });
  });
  it('leaves the workout out when no programme is running', () => {
    expect(workoutStripText({ status: 'none' })).toBeNull();
  });
});
