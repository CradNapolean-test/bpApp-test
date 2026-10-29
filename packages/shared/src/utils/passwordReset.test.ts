import { describe, expect, it } from 'vitest';

import { cleanResetCode, recoveryTokenFrom, resendWait, validateResetCode, validateResetEmail } from './passwordReset';

describe('validateResetEmail', () => {
  it('accepts an ordinary address, with spaces around it', () => {
    expect(validateResetEmail(' member@example.com ')).toBeNull();
  });
  it('refuses an empty or half-typed address', () => {
    expect(validateResetEmail('')).not.toBeNull();
    expect(validateResetEmail('member@')).not.toBeNull();
    expect(validateResetEmail('member@example')).not.toBeNull();
    expect(validateResetEmail('mem ber@example.com')).not.toBeNull();
  });
});

describe('reset code', () => {
  it('keeps only the digits, so a pasted "123 456" works', () => {
    expect(cleanResetCode('123 456')).toBe('123456');
    expect(cleanResetCode('123-456\n')).toBe('123456');
    expect(cleanResetCode('abc')).toBe('');
  });
  it('never keeps more than ten digits', () => {
    expect(cleanResetCode('123456789012345')).toBe('1234567890');
  });
  it('asks for the full code', () => {
    expect(validateResetCode('12345')).not.toBeNull();
    expect(validateResetCode('')).not.toBeNull();
    expect(validateResetCode('123456')).toBeNull();
    expect(validateResetCode('123 456')).toBeNull();
    expect(validateResetCode('12345678')).toBeNull();
  });
});

describe('recoveryTokenFrom', () => {
  const token = 'a'.repeat(56);
  it('takes the token of a recovery link', () => {
    expect(recoveryTokenFrom({ token_hash: token, type: 'recovery' })).toBe(token);
  });
  it('reads the first value when a parameter is repeated', () => {
    expect(recoveryTokenFrom({ token_hash: [token, 'x'], type: ['recovery'] })).toBe(token);
  });
  it('ignores other link types and missing or odd tokens', () => {
    expect(recoveryTokenFrom({ token_hash: token, type: 'signup' })).toBeNull();
    expect(recoveryTokenFrom({ token_hash: token })).toBeNull();
    expect(recoveryTokenFrom({ type: 'recovery' })).toBeNull();
    expect(recoveryTokenFrom({ token_hash: 'short', type: 'recovery' })).toBeNull();
    expect(recoveryTokenFrom({ token_hash: 'a'.repeat(30) + '<script>', type: 'recovery' })).toBeNull();
    expect(recoveryTokenFrom({ token_hash: 'a'.repeat(300), type: 'recovery' })).toBeNull();
  });
});

describe('resendWait', () => {
  it('allows a first request at once', () => {
    expect(resendWait(null, 1_000_000)).toBe(0);
  });
  it('counts down from a minute and rounds up', () => {
    expect(resendWait(1_000_000, 1_000_000)).toBe(60);
    expect(resendWait(1_000_000, 1_000_000 + 59_500)).toBe(1);
    expect(resendWait(1_000_000, 1_000_000 + 60_000)).toBe(0);
    expect(resendWait(1_000_000, 1_000_000 + 600_000)).toBe(0);
  });
});
