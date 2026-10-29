import { describe, expect, it } from 'vitest';
import { formatDateTime, formatLongDate, formatShortDate, formatTime, formatWeekdayShort } from './dates';

// 15 October 2026 is a Thursday.
describe('formatLongDate (en-GB, no comma)', () => {
  it('writes the weekday, the day and the month', () => {
    expect(formatLongDate('2026-10-15')).toBe('Thursday 15 Oct');
    expect(formatLongDate(new Date('2026-10-15T12:00:00Z'), { timeZone: 'UTC' })).toBe('Thursday 15 Oct');
  });

  it('can be short or leave the weekday out', () => {
    expect(formatLongDate('2026-10-15', { weekday: 'short' })).toBe('Thu 15 Oct');
    expect(formatLongDate('2026-10-15', { weekday: false })).toBe('15 Oct');
    expect(formatShortDate('2026-10-15')).toBe('15 Oct');
  });

  it('never shifts a plain calendar day, whatever timezone is asked for', () => {
    expect(formatLongDate('2026-10-15', { timeZone: 'Pacific/Auckland' })).toBe('Thursday 15 Oct');
    expect(formatLongDate('2026-10-15', { timeZone: 'America/Los_Angeles' })).toBe('Thursday 15 Oct');
  });

  it('uses the gym\'s timezone for a moment in time', () => {
    // 23:30 UTC on the 15th is already the 16th in Auckland (UTC+13 in October) but still the 15th in London (UTC+1).
    const moment = new Date('2026-10-15T23:30:00Z');
    expect(formatLongDate(moment, { timeZone: 'Pacific/Auckland' })).toBe('Friday 16 Oct');
    expect(formatLongDate(moment, { timeZone: 'Europe/London' })).toBe('Friday 16 Oct');
    expect(formatLongDate(new Date('2026-10-15T20:30:00Z'), { timeZone: 'Europe/London' })).toBe('Thursday 15 Oct');
  });

  it('is day-first like the rest of the UK, not month-first like the US', () => {
    expect(formatLongDate('2026-10-05')).toBe('Monday 5 Oct');
    expect(formatLongDate('2026-10-05')).not.toMatch(/Oct 5/);
  });
});

describe('formatWeekdayShort', () => {
  it('gives the three-letter weekday', () => {
    expect(formatWeekdayShort('2026-10-15')).toBe('Thu');
    expect(formatWeekdayShort('2026-10-18')).toBe('Sun');
  });
});

describe('formatTime', () => {
  it('writes a 12-hour time like formatClassTime does', () => {
    expect(formatTime(new Date('2026-10-15T17:00:00Z'), 'UTC')).toBe('5:00pm');
    expect(formatTime(new Date('2026-10-15T07:30:00Z'), 'UTC')).toBe('7:30am');
    expect(formatTime(new Date('2026-10-15T12:00:00Z'), 'UTC')).toBe('12:00pm');
    expect(formatTime(new Date('2026-10-15T00:15:00Z'), 'UTC')).toBe('12:15am');
  });

  it('follows the timezone', () => {
    expect(formatTime(new Date('2026-10-15T17:00:00Z'), 'Europe/London')).toBe('6:00pm');
  });
});

describe('formatDateTime', () => {
  it('joins the short date and the time', () => {
    expect(formatDateTime(new Date('2026-10-16T17:00:00Z'), 'Europe/London')).toBe('Fri 16 Oct, 6:00pm');
  });
});
