import { describe, expect, it } from 'vitest';
import {
  DEFAULT_LINK_DAILY_LIMIT,
  JOIN_NEUTRAL_MESSAGE,
  confirmationRequired,
  isExistingAccountAnswer,
  isMailRateLimit,
  isSignupDisabled,
  joinFailure,
  linkDailyLimit,
  linkUsable,
  validateJoinInput,
  type JoinFailure,
} from './joinFlow';

describe('the neutral error mapping', () => {
  it('says the same thing whether the address exists, the account failed, or the profile failed', () => {
    const kinds: JoinFailure[] = ['exists', 'create-failed', 'profile-failed'];
    const answers = kinds.map((k) => joinFailure(k));
    for (const a of answers) {
      expect(a).toEqual({ status: 400, error: JOIN_NEUTRAL_MESSAGE });
    }
    expect(JOIN_NEUTRAL_MESSAGE).not.toMatch(/already|registered|exists|email/i);
  });

  it('asks the person to fix their own typing mistakes', () => {
    expect(joinFailure('invalid-email').error).toMatch(/valid email/);
    expect(joinFailure('weak-password').error).toMatch(/8 characters/);
  });

  it('uses 429 for both limits, with no hint of which one was hit', () => {
    expect(joinFailure('ip-limit')).toEqual(joinFailure('link-limit'));
    expect(joinFailure('ip-limit').status).toBe(429);
  });

  it('tells a person with a dead link to ask their coach', () => {
    expect(joinFailure('bad-link').error).toMatch(/ask your coach/i);
  });
});

describe('validateJoinInput', () => {
  it('accepts a good request and tidies the email', () => {
    expect(validateJoinInput({ token: ' abc ', email: '  Alex@Example.COM ', password: 'longenough' })).toEqual({
      ok: true,
      token: 'abc',
      email: 'alex@example.com',
      password: 'longenough',
    });
  });

  it('names the first thing wrong', () => {
    expect(validateJoinInput({ email: 'a@b.co', password: 'longenough' })).toEqual({ ok: false, failure: 'bad-link' });
    expect(validateJoinInput({ token: 't', email: 'not an email', password: 'longenough' })).toEqual({ ok: false, failure: 'invalid-email' });
    expect(validateJoinInput({ token: 't', email: 'a@b.co', password: 'short' })).toEqual({ ok: false, failure: 'weak-password' });
    expect(validateJoinInput(null)).toEqual({ ok: false, failure: 'bad-link' });
  });

  it('refuses silly lengths', () => {
    expect(validateJoinInput({ token: 'x'.repeat(300), email: 'a@b.co', password: 'longenough' })).toEqual({ ok: false, failure: 'bad-link' });
    expect(validateJoinInput({ token: 't', email: 'a@b.co', password: 'x'.repeat(500) })).toEqual({ ok: false, failure: 'weak-password' });
  });
});

describe('linkUsable and the per-link limit', () => {
  const now = new Date('2026-10-16T12:00:00Z').getTime();

  it('a live link is usable', () => {
    expect(linkUsable({ active: true }, now)).toBe('ok');
    expect(linkUsable({ active: true, expires_at: '2026-10-17T00:00:00Z' }, now)).toBe('ok');
  });

  it('a switched-off, missing or expired link is not', () => {
    expect(linkUsable({ active: false }, now)).toBe('inactive');
    expect(linkUsable(null, now)).toBe('missing');
    expect(linkUsable({ active: true, expires_at: '2026-10-16T11:59:59Z' }, now)).toBe('expired');
  });

  it('uses the link\'s own daily limit, or 50', () => {
    expect(linkDailyLimit({ active: true, max_uses_per_day: 10 })).toBe(10);
    expect(linkDailyLimit({ active: true })).toBe(DEFAULT_LINK_DAILY_LIMIT);
    expect(linkDailyLimit({ active: true, max_uses_per_day: 0 })).toBe(DEFAULT_LINK_DAILY_LIMIT);
    expect(DEFAULT_LINK_DAILY_LIMIT).toBe(50);
  });
});

describe('email confirmation (D17)', () => {
  it('is required by default, and only switched off by saying "false"', () => {
    expect(confirmationRequired(undefined)).toBe(true);
    expect(confirmationRequired('')).toBe(true);
    expect(confirmationRequired('true')).toBe(true);
    expect(confirmationRequired('false')).toBe(false);
    expect(confirmationRequired(' False ')).toBe(false);
  });

  it('recognises Supabase saying public sign-up is switched off', () => {
    expect(isSignupDisabled({ code: 'signup_disabled' })).toBe(true);
    expect(isSignupDisabled({ message: 'Signups not allowed for this instance' })).toBe(true);
    expect(isSignupDisabled({ message: 'Email signups are disabled' })).toBe(true);
    expect(isSignupDisabled({ code: 'over_email_send_rate_limit' })).toBe(false);
    expect(isSignupDisabled({ message: 'Database error saving new user' })).toBe(false);
    expect(isSignupDisabled(null)).toBe(false);
  });

  it('treats an obfuscated sign-up answer as an existing account', () => {
    expect(isExistingAccountAnswer({ identities: [] })).toBe(true);
    expect(isExistingAccountAnswer({ identities: [{ id: 'x' }] })).toBe(false);
    expect(isExistingAccountAnswer({})).toBe(false);
    expect(isExistingAccountAnswer(null)).toBe(false);
  });

  it('recognises Supabase\'s mailer limit', () => {
    expect(isMailRateLimit({ code: 'over_email_send_rate_limit' })).toBe(true);
    expect(isMailRateLimit({ status: 429 })).toBe(true);
    expect(isMailRateLimit({ message: 'email rate limit exceeded' })).toBe(true);
    expect(isMailRateLimit({ message: 'Password should be at least 6 characters' })).toBe(false);
    expect(isMailRateLimit(null)).toBe(false);
  });
});
