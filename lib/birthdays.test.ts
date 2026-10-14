import { describe, expect, it } from 'vitest';
import { birthdayMessage, isBirthdayToday } from './birthdays';

describe('isBirthdayToday', () => {
  it('matches month and day regardless of year', () => {
    expect(isBirthdayToday('1990-10-14', '2026-10-14')).toBe(true);
    expect(isBirthdayToday('1990-10-14', '2026-10-15')).toBe(false);
  });
  it('celebrates 29 Feb on 28 Feb only in non-leap years', () => {
    expect(isBirthdayToday('1992-02-29', '2026-02-28')).toBe(true);
    expect(isBirthdayToday('1992-02-29', '2028-02-28')).toBe(false);
    expect(isBirthdayToday('1992-02-29', '2028-02-29')).toBe(true);
  });
  it('ignores missing or malformed dates', () => {
    expect(isBirthdayToday(null, '2026-10-14')).toBe(false);
    expect(isBirthdayToday('14/10/1990', '2026-10-14')).toBe(false);
  });
});

describe('birthdayMessage', () => {
  it('uses the first name', () => {
    expect(birthdayMessage('Sam Smith')).toContain('Happy birthday Sam!');
    expect(birthdayMessage(null)).toContain('Happy birthday there!');
  });
});
