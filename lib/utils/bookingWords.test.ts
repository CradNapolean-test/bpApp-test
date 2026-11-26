import { describe, expect, it } from 'vitest';
import { cancelCreditWords, ordinal, waitlistPlaceText } from './bookingWords';

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [10, '10th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [101, '101st'],
    [111, '111th'],
    [112, '112th'],
    [113, '113th'],
  ])('%i is %s', (n, words) => {
    expect(ordinal(n)).toBe(words);
  });
});

describe('waitlistPlaceText', () => {
  it('names the place in the queue', () => {
    expect(waitlistPlaceText(1)).toBe('1st in the queue');
    expect(waitlistPlaceText(2)).toBe('2nd in the queue');
    expect(waitlistPlaceText(11)).toBe('11th in the queue');
  });

  it('says nothing when the place is not known, so the screen shows "On the waitlist" alone', () => {
    expect(waitlistPlaceText(null)).toBeNull();
    expect(waitlistPlaceText(undefined)).toBeNull();
    expect(waitlistPlaceText(0)).toBeNull();
    expect(waitlistPlaceText(Number.NaN)).toBeNull();
  });
});

describe('cancelCreditWords', () => {
  it('is singular for a session that costs 1', () => {
    const w = cancelCreditWords(1);
    expect(w.rowLabel).toBe('Your credit');
    expect(w.inTime).toBe('You can cancel now and get your credit back.');
    expect(w.late).toBe("It's too close to the session to get your credit back. You can still cancel, but it won't be refunded.");
    expect(w.lateNote).toBe('Past the cancel deadline — cancelling now forfeits your credit');
  });

  it('gives the real number, plural, for a session that costs more', () => {
    const w = cancelCreditWords(2);
    expect(w.rowLabel).toBe('Your 2 credits');
    expect(w.refunded).toBe('Refunded');
    expect(w.notRefunded).toBe('Not refunded');
    expect(w.inTime).toBe('You can cancel now and get your 2 credits back.');
    expect(w.late).toBe("It's too close to the session to get your 2 credits back. You can still cancel, but they won't be refunded.");
    expect(w.promotedLate).toContain('you get your 2 credits back');
    expect(w.lateNote).toBe('Past the cancel deadline — cancelling now forfeits your 2 credits');
    expect(w.promotedNote).toContain('to get your 2 credits back');
  });

  it('treats an unknown cost as the default of 1', () => {
    expect(cancelCreditWords(undefined).rowLabel).toBe('Your credit');
    expect(cancelCreditWords(null).rowLabel).toBe('Your credit');
  });

  it('has no credit row for a free session', () => {
    const w = cancelCreditWords(0);
    expect(w.rowLabel).toBeNull();
    expect(w.late).not.toMatch(/credit/);
  });
});
