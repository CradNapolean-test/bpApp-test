import { describe, expect, it } from 'vitest';
import { SANDBOX_SENDER, checkSender, skipSentence } from './emailConfig';

describe('checkSender', () => {
  it('has no email without a key', () => {
    expect(checkSender({ NODE_ENV: 'production', RESEND_FROM_EMAIL: 'Gym <hello@example.com>' })).toEqual({ ok: false, reason: 'no-key' });
    expect(checkSender({ RESEND_API_KEY: '   ' })).toEqual({ ok: false, reason: 'no-key' });
  });

  it('in production, an unset sender means email is not configured instead of sending from the sandbox', () => {
    expect(checkSender({ RESEND_API_KEY: 'k', NODE_ENV: 'production' })).toEqual({ ok: false, reason: 'sender-not-configured' });
    expect(checkSender({ RESEND_API_KEY: 'k', NODE_ENV: 'production', RESEND_FROM_EMAIL: '  ' })).toEqual({ ok: false, reason: 'sender-not-configured' });
  });

  it('in production, a real sender is used as it is', () => {
    expect(checkSender({ RESEND_API_KEY: 'k', NODE_ENV: 'production', RESEND_FROM_EMAIL: ' Gym <hello@example.com> ' })).toEqual({
      ok: true,
      from: 'Gym <hello@example.com>',
      sandbox: false,
    });
  });

  it('outside production the sandbox sender is allowed, so a developer can try the flow', () => {
    expect(checkSender({ RESEND_API_KEY: 'k', NODE_ENV: 'development' })).toEqual({ ok: true, from: SANDBOX_SENDER, sandbox: true });
    expect(checkSender({ RESEND_API_KEY: 'k' })).toEqual({ ok: true, from: SANDBOX_SENDER, sandbox: true });
  });
});

describe('skipSentence', () => {
  it('says what is missing in words a coach can read', () => {
    expect(skipSentence('sender-not-configured')).toBe('Email is not set up for this gym yet.');
    expect(skipSentence('no-key')).toMatch(/not switched on/);
    expect(skipSentence(undefined)).toMatch(/could not be sent/);
  });
});
