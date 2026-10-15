import { describe, expect, it } from 'vitest';
import { blackoutProblem, normaliseReferralUrl, referralUrlProblem, timezoneChangeBody } from './gymSettings';

describe('blackoutProblem', () => {
  it('has nothing to say when the blackout is off', () => {
    expect(blackoutProblem(false, '23:00', '23:00')).toBeNull();
  });

  it('accepts an overnight window, and a daytime one', () => {
    expect(blackoutProblem(true, '23:00', '05:00')).toBeNull();
    expect(blackoutProblem(true, '12:00', '13:30')).toBeNull();
  });

  it('refuses a window that starts and ends together', () => {
    expect(blackoutProblem(true, '05:00', '05:00')).toMatch(/different times/);
    // seconds from the database must not hide it
    expect(blackoutProblem(true, '05:00:00', '05:00')).toMatch(/different times/);
  });

  it('refuses a missing time', () => {
    expect(blackoutProblem(true, '', '05:00')).toMatch(/Choose/);
    expect(blackoutProblem(true, '23:00', '')).toMatch(/Choose/);
  });
});

describe('timezoneChangeBody', () => {
  it('says already-booked sessions move', () => {
    const text = timezoneChangeBody('Europe/London', 'Pacific/Auckland');
    expect(text).toMatch(/already booked/);
    expect(text).toContain('Europe/London');
    expect(text).toContain('Pacific/Auckland');
  });
});

describe('referralUrlProblem', () => {
  it('accepts a blank value (clears it) and an https address', () => {
    expect(referralUrlProblem('')).toBeNull();
    expect(referralUrlProblem('   ')).toBeNull();
    expect(referralUrlProblem('https://example.com/refer?x=1')).toBeNull();
  });

  it('refuses http, scripts, spaces and nonsense', () => {
    expect(referralUrlProblem('http://example.com')).toMatch(/https/);
    expect(referralUrlProblem('javascript:alert(1)')).toMatch(/https/);
    expect(referralUrlProblem('https://example.com/a b')).toMatch(/spaces/);
    expect(referralUrlProblem('example.com')).toMatch(/https/);
  });

  it('refuses a very long address', () => {
    expect(referralUrlProblem(`https://example.com/${'a'.repeat(500)}`)).toMatch(/500/);
  });

  it('stores a blank as nothing', () => {
    expect(normaliseReferralUrl('  ')).toBeNull();
    expect(normaliseReferralUrl(' https://example.com ')).toBe('https://example.com');
  });
});
