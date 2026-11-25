import { describe, expect, it } from 'vitest';
import { isIsoDate, nextUnreviewedDay, openingPhotoDay, photoReviewSince, unreviewedPhotoDays } from './photoReview';

const TODAY = '2026-11-06';

describe('photoReviewSince', () => {
  it('is seven days before today (today and the week before it: eight days)', () => {
    expect(photoReviewSince(TODAY)).toBe('2026-10-30');
    expect(photoReviewSince('2026-03-01')).toBe('2026-02-22');
  });
});

describe('unreviewedPhotoDays', () => {
  const since = photoReviewSince(TODAY);

  it('lists the days with meals the coach has neither marked reviewed nor left feedback on, oldest first', () => {
    const days = [
      { date: '2026-11-05', photos: 3 },
      { date: '2026-10-30', photos: 4 },
      { date: '2026-11-01', photos: 2 },
      { date: '2026-11-02', photos: 1 },
      { date: '2026-11-03', photos: 0 },
    ];
    expect(unreviewedPhotoDays(days, ['2026-11-01'], ['2026-11-02'], since)).toEqual([
      { date: '2026-10-30', photos: 4 },
      { date: '2026-11-05', photos: 3 },
    ]);
  });

  it('leaves out days before the week, and days after today when today is given', () => {
    const days = [
      { date: '2026-10-29', photos: 5 },
      { date: '2026-11-06', photos: 1 },
      { date: '2026-11-07', photos: 1 },
    ];
    expect(unreviewedPhotoDays(days, [], [], since).map((d) => d.date)).toEqual(['2026-11-06', '2026-11-07']);
    expect(unreviewedPhotoDays(days, [], [], since, TODAY).map((d) => d.date)).toEqual(['2026-11-06']);
  });

  it('adds up a day that appears twice', () => {
    expect(unreviewedPhotoDays([{ date: TODAY, photos: 1 }, { date: TODAY, photos: 2 }], [], [], since)).toEqual([{ date: TODAY, photos: 3 }]);
  });

  it('is empty when every day is reviewed', () => {
    expect(unreviewedPhotoDays([{ date: TODAY, photos: 2 }], [TODAY], [], since)).toEqual([]);
  });
});

describe('openingPhotoDay', () => {
  it('opens on the day a link asks for, else the oldest day to review, else today', () => {
    expect(openingPhotoDay(['2026-11-01', '2026-11-03'], TODAY, '2026-11-03')).toBe('2026-11-03');
    expect(openingPhotoDay(['2026-11-01', '2026-11-03'], TODAY, null)).toBe('2026-11-01');
    expect(openingPhotoDay([], TODAY)).toBe(TODAY);
  });

  it('ignores a day asked for that is not a date or is after today', () => {
    expect(openingPhotoDay(['2026-11-01'], TODAY, 'tomorrow')).toBe('2026-11-01');
    expect(openingPhotoDay(['2026-11-01'], TODAY, '2026-11-07')).toBe('2026-11-01');
    expect(openingPhotoDay([], TODAY, '2026-13-40')).toBe(TODAY);
  });
});

describe('nextUnreviewedDay', () => {
  const left = ['2026-11-01', '2026-11-03', '2026-11-05'];

  it('goes to the next day to review after the one on screen', () => {
    expect(nextUnreviewedDay(left, '2026-11-01')).toBe('2026-11-03');
    expect(nextUnreviewedDay(left, '2026-11-02')).toBe('2026-11-03');
  });

  it('goes round to the oldest after the last, and has none when the day on screen is the only one', () => {
    expect(nextUnreviewedDay(left, '2026-11-05')).toBe('2026-11-01');
    expect(nextUnreviewedDay(left, TODAY)).toBe('2026-11-01');
    expect(nextUnreviewedDay(['2026-11-03'], '2026-11-03')).toBeNull();
    expect(nextUnreviewedDay([], TODAY)).toBeNull();
  });
});

describe('isIsoDate', () => {
  it('accepts a real YYYY-MM-DD date only', () => {
    expect(isIsoDate('2026-11-06')).toBe(true);
    expect(isIsoDate('2026-11-6')).toBe(false);
    expect(isIsoDate('2026-02-30x')).toBe(false);
    // Days that do not exist, which Date.parse rolls over into the next month.
    expect(isIsoDate('2026-02-30')).toBe(false);
    expect(isIsoDate('2026-04-31')).toBe(false);
    expect(isIsoDate('2028-02-29')).toBe(true);
    expect(isIsoDate(null)).toBe(false);
  });
});
