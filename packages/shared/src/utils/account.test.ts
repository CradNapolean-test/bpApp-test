import { describe, expect, it } from 'vitest';

import { DEFAULT_THEME, isThemePreference, resolveScheme, validateNewEmail, validateNewPassword, initialsOf } from './account';

describe('theme', () => {
  it('knows the three choices and nothing else', () => {
    expect(isThemePreference('light')).toBe(true);
    expect(isThemePreference('dark')).toBe(true);
    expect(isThemePreference('system')).toBe(true);
    expect(isThemePreference('purple')).toBe(false);
    expect(isThemePreference(null)).toBe(false);
    expect(isThemePreference(undefined)).toBe(false);
  });

  it('a chosen theme wins over the phone setting; System follows the phone', () => {
    expect(resolveScheme('light', 'dark')).toBe('light');
    expect(resolveScheme('dark', 'light')).toBe('dark');
    expect(resolveScheme('system', 'light')).toBe('light');
    expect(resolveScheme('system', 'dark')).toBe('dark');
  });

  it('System with an unknown phone setting falls back to dark, the app default', () => {
    expect(resolveScheme('system', null)).toBe('dark');
    expect(resolveScheme('system', undefined)).toBe('dark');
    expect(DEFAULT_THEME).toBe('dark');
  });
});

describe('validateNewPassword', () => {
  it('needs 8 characters and the same twice', () => {
    expect(validateNewPassword('short', 'short')).toBe('Password must be at least 8 characters.');
    expect(validateNewPassword('longenough', 'different1')).toBe('Passwords do not match.');
    expect(validateNewPassword('longenough', 'longenough')).toBeNull();
    expect(validateNewPassword('12345678', '12345678')).toBeNull();
  });
});

describe('validateNewEmail', () => {
  it('accepts a normal address and trims it', () => {
    expect(validateNewEmail(' new@example.com ', 'old@example.com')).toBeNull();
  });

  it('catches an obvious typo', () => {
    for (const bad of ['', 'nope', 'a@b', 'a b@c.com', '@c.com', 'a@.com']) expect(validateNewEmail(bad, 'old@example.com')).toBe('Please enter a valid email address.');
  });

  it('refuses the address they already have, ignoring case', () => {
    expect(validateNewEmail('OLD@example.com', 'old@example.com')).toBe('That is already your email address.');
  });
});

describe('initialsOf', () => {
  it('takes the first and last initial of a name', () => {
    expect(initialsOf('Jamie Thornton')).toBe('JT');
    expect(initialsOf('  jamie   thornton  ')).toBe('JT');
    expect(initialsOf('Mary Jane Watson')).toBe('MW');
  });
  it('uses one letter for a single word', () => {
    expect(initialsOf('Jamie')).toBe('J');
  });
  it('uses the first letter before the @ for an email address', () => {
    expect(initialsOf('member.realistic.sandbox@example.com')).toBe('M');
    expect(initialsOf('jordan@example.com')).toBe('J');
  });
  it('never returns nothing', () => {
    expect(initialsOf('')).toBe('?');
    expect(initialsOf('   ')).toBe('?');
    expect(initialsOf('@example.com')).toBe('?');
  });
});
