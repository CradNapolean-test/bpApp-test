import { describe, expect, it } from 'vitest';
import {
  checkinDayLabel,
  checkinRing,
  checkinStripCaption,
  checkinStripDays,
  coachCalories,
  coachWeekStripStart,
  daysInRange,
  foodDayLabel,
  foodRing,
  foodStripCaption,
  foodStripDays,
  monthOver,
  olderSpan,
  reachBackDays,
  ringState,
  stripDayName,
  weekPhrase,
  weekStartOfDay,
  type CheckinDay,
  type FoodDay,
} from './dayStrip';

// The web (lib/utils) and the phone (packages/shared/src/utils) have this same file: both must draw the same strip.
// The mock-up's sample week: today is Thursday 19 November 2026.
const TODAY = '2026-11-19';

describe('days on the strip', () => {
  it('lists every day in a range, both ends included, across a month end', () => {
    expect(daysInRange('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(daysInRange('2026-11-02', '2026-11-01')).toEqual([]);
  });

  it('runs the food strip from 30 days back to tomorrow', () => {
    const days = foodStripDays(TODAY, 30, 1);
    expect(days[0]).toBe('2026-10-20');
    expect(days[days.length - 1]).toBe('2026-11-20');
    expect(days).toHaveLength(32);
  });

  it('runs the check-in strip in whole weeks, from the Monday of the week 30 days ago to this Sunday', () => {
    const days = checkinStripDays(TODAY, 30);
    expect(days[0]).toBe('2026-10-19');
    expect(days[days.length - 1]).toBe('2026-11-22');
    expect(days.length % 7).toBe(0);
  });

  it('finds the Monday of a week, a Sunday included', () => {
    expect(weekStartOfDay('2026-11-22')).toBe('2026-11-16');
    expect(weekStartOfDay('2026-11-16')).toBe('2026-11-16');
  });

  it('crosses the October clock change as plain days', () => {
    expect(daysInRange('2026-10-24', '2026-10-26')).toEqual(['2026-10-24', '2026-10-25', '2026-10-26']);
  });
});

describe("a coach's strips", () => {
  // The page carries the last 84 days: from Thursday 27 August.
  const PAGE_FROM = '2026-08-27';

  it("reads the older days right up to the page's first, with no gap and none read twice", () => {
    expect(olderSpan(PAGE_FROM, 28)).toEqual({ from: '2026-07-30', to: '2026-08-26' });
    expect(olderSpan(PAGE_FROM, 56)).toEqual({ from: '2026-07-02', to: '2026-08-26' });
    expect(olderSpan(PAGE_FROM, 0).from).toBe(PAGE_FROM);
  });

  it('reaches back exactly to the Monday of a week opened from the dashboard that is older than the page', () => {
    expect(reachBackDays(PAGE_FROM, '2026-07-06')).toBe(52);
    expect(reachBackDays(PAGE_FROM, '2026-07-08')).toBe(52);
    expect(olderSpan(PAGE_FROM, reachBackDays(PAGE_FROM, '2026-07-08')).from).toBe('2026-07-06');
    // The week the page's first day is in.
    expect(reachBackDays(PAGE_FROM, '2026-08-24')).toBe(3);
    expect(reachBackDays(PAGE_FROM, '2026-09-07')).toBe(0);
    expect(reachBackDays(PAGE_FROM, null)).toBe(0);
  });

  it('starts the check-in strip on a whole week, and always on the week opened', () => {
    expect(coachWeekStripStart(PAGE_FROM, null)).toBe('2026-08-31');
    expect(coachWeekStripStart('2026-08-31', null)).toBe('2026-08-31');
    expect(coachWeekStripStart(PAGE_FROM, '2026-07-08')).toBe('2026-07-06');
    expect(coachWeekStripStart(PAGE_FROM, '2026-09-14')).toBe('2026-08-31');
    // Four more weeks (Earlier) still keep the week opened on the strip.
    expect(coachWeekStripStart('2026-06-08', '2026-07-08')).toBe('2026-06-08');
  });

  it("does not grow at the front when the week opened has its rows in (so it is not pushed out of view)", () => {
    for (const opened of ['2026-07-08', '2026-08-24', '2026-03-02']) {
      const loaded = olderSpan(PAGE_FROM, reachBackDays(PAGE_FROM, opened)).from;
      expect(coachWeekStripStart(loaded, opened)).toBe(coachWeekStripStart(PAGE_FROM, opened));
    }
  });
});

describe('food ring', () => {
  const day = (calories: number, hasFood = true): FoodDay => ({ calories, hasFood });

  it('fills with calories against the target, full at or over it', () => {
    expect(foodRing('2026-11-18', TODAY, day(1025), 2050)).toBeCloseTo(0.5);
    expect(foodRing('2026-11-17', TODAY, day(1980), 2050)).toBeCloseTo(0.966, 2);
    expect(foodRing('2026-11-16', TODAY, day(2400), 2050)).toBe(1);
  });

  it('is plain with no food, and full once any food is in when there is no target yet', () => {
    expect(foodRing('2026-11-18', TODAY, day(0, false), 2050)).toBe(0);
    expect(foodRing('2026-11-18', TODAY, null, 2050)).toBe(0);
    expect(foodRing('2026-11-18', TODAY, day(300), null)).toBe(1);
    expect(foodRing('2026-11-18', TODAY, day(300), 0)).toBe(1);
  });

  it('keeps tomorrow plain even with food planned', () => {
    expect(foodRing('2026-11-20', TODAY, day(1500), 2050)).toBe(0);
  });

  it('names the three looks', () => {
    expect(ringState(0)).toBe('plain');
    expect(ringState(0.4)).toBe('part');
    expect(ringState(1)).toBe('done');
  });
});

describe('check-in ring', () => {
  const all: ('sleep' | 'steps' | 'water')[] = ['sleep', 'steps', 'water'];

  it('fills a third, two thirds or all of the ring', () => {
    expect(checkinRing('2026-11-19', TODAY, { sleep: 7.5 }, all)).toBeCloseTo(1 / 3);
    expect(checkinRing('2026-11-17', TODAY, { sleep: 7, steps: 10450, water: null }, all)).toBeCloseTo(2 / 3);
    expect(checkinRing('2026-11-16', TODAY, { sleep: 8, steps: 9000, water: 2.5 }, all)).toBe(1);
    expect(checkinRing('2026-11-18', TODAY, {}, all)).toBe(0);
  });

  it('counts only the trackers switched on: 1 of 2 is half', () => {
    expect(checkinRing('2026-11-19', TODAY, { sleep: 7, water: 2 }, ['sleep', 'steps'])).toBe(0.5);
  });

  it('with all three switched off, is full once the weight is in', () => {
    expect(checkinRing('2026-11-19', TODAY, { bodyweight: 82.3 }, [])).toBe(1);
    expect(checkinRing('2026-11-19', TODAY, { sleep: 8 }, [])).toBe(0);
  });

  it('keeps the days still to come plain', () => {
    expect(checkinRing('2026-11-21', TODAY, { sleep: 8, steps: 1, water: 1 }, all)).toBe(0);
  });
});

describe('words', () => {
  it('names a day and the month over the 1st', () => {
    expect(stripDayName('2026-11-19')).toBe('Thu 19 Nov');
    expect(monthOver('2026-11-01')).toBe('Nov');
    expect(monthOver('2026-11-02')).toBeNull();
  });

  it('labels food days', () => {
    expect(foodDayLabel('2026-11-17', TODAY, { calories: 1980, hasFood: true }, 2050)).toBe('Tue 17 Nov, 1,980 of 2,050 kcal');
    expect(foodDayLabel('2026-11-19', TODAY, null, 2050)).toBe('Thu 19 Nov, today, nothing logged');
    expect(foodDayLabel('2026-11-18', TODAY, { calories: 640, hasFood: true }, null)).toBe('Wed 18 Nov, 640 kcal');
    expect(foodDayLabel('2026-11-20', TODAY, null, 2050)).toBe('Fri 20 Nov, tomorrow');
    expect(foodDayLabel('2026-11-20', TODAY, { calories: 500, hasFood: true }, 2050)).toBe('Fri 20 Nov, tomorrow, 500 of 2,050 planned');
  });

  it('labels check-in days, with the food for a coach', () => {
    const all: ('sleep' | 'steps' | 'water')[] = ['sleep', 'steps', 'water'];
    expect(checkinDayLabel('2026-11-19', TODAY, { sleep: 7, steps: 9000 }, all)).toBe('Thu 19 Nov, today, 2 of 3 checked in');
    expect(checkinDayLabel('2026-11-21', TODAY, null, all)).toBe('Sat 21 Nov');
    expect(checkinDayLabel('2026-11-18', TODAY, { bodyweight: 82 }, [])).toBe('Wed 18 Nov, weighed in');
    expect(checkinDayLabel('2026-11-18', TODAY, {}, all, { calories: 1150, hasFood: true })).toBe('Wed 18 Nov, 0 of 3 checked in, 1,150 kcal');
    expect(checkinDayLabel('2026-11-18', TODAY, {}, all, null)).toBe('Wed 18 Nov, 0 of 3 checked in, no food');
  });

  it("gives the coach the day's calories or no food", () => {
    expect(coachCalories({ calories: 2240.4, hasFood: true })).toEqual({ text: '2,240', noFood: false });
    expect(coachCalories(undefined)).toEqual({ text: 'no food', noFood: true });
  });

  it('names the week', () => {
    expect(weekPhrase('2026-11-16', TODAY)).toBe('this week');
    expect(weekPhrase('2026-11-09', TODAY)).toBe('last week');
    expect(weekPhrase('2026-11-02', TODAY)).toBe('the week of 2 Nov');
  });
});

describe('captions', () => {
  it("counts the picked week's food days up to today", () => {
    const food = new Map<string, FoodDay>([
      ['2026-11-16', { calories: 2400, hasFood: true }],
      ['2026-11-17', { calories: 1980, hasFood: true }],
      ['2026-11-18', { calories: 1025, hasFood: true }],
      ['2026-11-20', { calories: 900, hasFood: true }],
      ['2026-11-15', { calories: 2000, hasFood: true }],
    ]);
    expect(foodStripCaption('2026-11-17', TODAY, food, true)).toBe('Food logged on 3 days this week. A full ring means the day reached its calories.');
    expect(foodStripCaption('2026-11-15', TODAY, food, false)).toBe('Food logged on 1 day last week. A ring means food was logged that day.');
  });

  it("counts the picked week's fully checked-in days so far", () => {
    const all: ('sleep' | 'steps' | 'water')[] = ['sleep', 'steps', 'water'];
    const logs = new Map<string, CheckinDay>([
      ['2026-11-16', { sleep: 8, steps: 9000, water: 2.5 }],
      ['2026-11-17', { sleep: 7, steps: 10450 }],
      ['2026-11-19', { sleep: 7.5 }],
    ]);
    expect(checkinStripCaption('2026-11-19', TODAY, logs, all)).toBe('1 of 4 days fully checked in this week. A part ring shows how much of a day is in.');
    expect(checkinStripCaption('2026-11-10', TODAY, logs, all)).toBe('0 of 7 days fully checked in last week. A part ring shows how much of a day is in.');
    expect(checkinStripCaption('2026-11-19', TODAY, new Map([['2026-11-19', { bodyweight: 80 }]]), [])).toBe(
      "1 of 4 days weighed in this week. A full ring means the day's weight is in."
    );
  });
});
