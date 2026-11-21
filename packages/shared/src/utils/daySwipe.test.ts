import { describe, expect, it } from 'vitest';
import { neighbourDays, startsAtEdge, swipeStep, SWIPE_DISTANCE, SWIPE_EDGE } from './daySwipe';

describe('swipeStep', () => {
  it('moves to the next day when the finger goes left, and to the day before when it goes right', () => {
    expect(swipeStep(-80, 0)).toBe(1);
    expect(swipeStep(80, 0)).toBe(-1);
  });

  it('needs the finger to travel SWIPE_DISTANCE sideways', () => {
    expect(swipeStep(-(SWIPE_DISTANCE - 1), 0)).toBe(0);
    expect(swipeStep(SWIPE_DISTANCE - 1, 0)).toBe(0);
    expect(swipeStep(-SWIPE_DISTANCE, 0)).toBe(1);
    expect(swipeStep(SWIPE_DISTANCE, 0)).toBe(-1);
  });

  it('leaves a scroll alone: a move more than half as far up or down as sideways is not a swipe', () => {
    expect(swipeStep(-100, 50)).toBe(1);
    expect(swipeStep(-100, -50)).toBe(1);
    expect(swipeStep(-100, 51)).toBe(0);
    expect(swipeStep(100, -51)).toBe(0);
    expect(swipeStep(10, 400)).toBe(0);
  });

  it('is not a swipe for a tap or a figure that is not a number', () => {
    expect(swipeStep(0, 0)).toBe(0);
    expect(swipeStep(Number.NaN, 0)).toBe(0);
  });
});

describe('startsAtEdge', () => {
  it('leaves the strip at either side of the screen to the phone', () => {
    expect(startsAtEdge(0, 390)).toBe(true);
    expect(startsAtEdge(SWIPE_EDGE - 1, 390)).toBe(true);
    expect(startsAtEdge(SWIPE_EDGE, 390)).toBe(false);
    expect(startsAtEdge(195, 390)).toBe(false);
    expect(startsAtEdge(390 - SWIPE_EDGE, 390)).toBe(false);
    expect(startsAtEdge(390 - SWIPE_EDGE + 1, 390)).toBe(true);
  });
});

describe('neighbourDays', () => {
  const days = ['2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];

  it('gives the days either side of the one picked', () => {
    expect(neighbourDays(days, '2026-11-20')).toEqual({ previous: '2026-11-19', next: '2026-11-21' });
  });

  it('stops at either end of the strip', () => {
    expect(neighbourDays(days, '2026-11-19')).toEqual({ previous: null, next: '2026-11-20' });
    expect(neighbourDays(days, '2026-11-22')).toEqual({ previous: '2026-11-21', next: null });
    expect(neighbourDays(['2026-11-21'], '2026-11-21')).toEqual({ previous: null, next: null });
  });

  it('goes nowhere when the day picked is not on the strip', () => {
    expect(neighbourDays(days, '2026-12-01')).toEqual({ previous: null, next: null });
    expect(neighbourDays([], '2026-11-21')).toEqual({ previous: null, next: null });
  });
});
