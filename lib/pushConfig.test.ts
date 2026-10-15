import { describe, expect, it } from 'vitest';
import { checkPushConfig, pushFailureKey, vapidSubject } from './pushConfig';

const KEYS = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' };

describe('vapidSubject', () => {
  it('uses VAPID_SUBJECT when it is set', () => {
    expect(vapidSubject({ VAPID_SUBJECT: 'mailto:support@example.com' })).toBe('mailto:support@example.com');
    expect(vapidSubject({ VAPID_SUBJECT: 'https://example.com/contact' })).toBe('https://example.com/contact');
  });

  it('turns a bare address into a mailto:', () => {
    expect(vapidSubject({ VAPID_SUBJECT: 'support@example.com' })).toBe('mailto:support@example.com');
  });

  it('falls back to SUPPORT_EMAIL', () => {
    expect(vapidSubject({ SUPPORT_EMAIL: ' help@example.com ' })).toBe('mailto:help@example.com');
  });

  it('has NO default: a personal address is never made up', () => {
    expect(vapidSubject({})).toBeNull();
    expect(vapidSubject({ VAPID_SUBJECT: '  ', SUPPORT_EMAIL: '' })).toBeNull();
  });
});

describe('checkPushConfig', () => {
  it('is ready with keys and a contact', () => {
    expect(checkPushConfig({ ...KEYS, SUPPORT_EMAIL: 'help@example.com' })).toEqual({ ok: true, subject: 'mailto:help@example.com' });
  });

  it('skips push, and says why, without keys', () => {
    expect(checkPushConfig({ SUPPORT_EMAIL: 'help@example.com' })).toEqual({ ok: false, reason: 'not-configured' });
    expect(checkPushConfig({ VAPID_PUBLIC_KEY: 'pub', SUPPORT_EMAIL: 'help@example.com' })).toEqual({ ok: false, reason: 'not-configured' });
  });

  it('skips push, and says why, when there is no contact to give the push services', () => {
    expect(checkPushConfig(KEYS)).toEqual({ ok: false, reason: 'no-contact' });
  });
});

describe('pushFailureKey', () => {
  it('is the HTTP status, or network when there was no answer', () => {
    expect(pushFailureKey({ statusCode: 410 })).toBe('410');
    expect(pushFailureKey({ statusCode: 429, endpoint: 'https://push.example/abc' })).toBe('429');
    expect(pushFailureKey(new Error('socket hang up'))).toBe('network');
    expect(pushFailureKey(null)).toBe('network');
  });
});
