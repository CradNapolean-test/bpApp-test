import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isAuthorized, isAuthorizedCron } from './cronAuth';

describe('isAuthorized', () => {
  it('accepts the right bearer secret', () => {
    expect(isAuthorized('Bearer s3cret-value', 's3cret-value')).toBe(true);
  });

  it('refuses a wrong or missing header', () => {
    expect(isAuthorized('Bearer nope', 's3cret-value')).toBe(false);
    expect(isAuthorized('s3cret-value', 's3cret-value')).toBe(false);
    expect(isAuthorized('', 's3cret-value')).toBe(false);
    expect(isAuthorized(null, 's3cret-value')).toBe(false);
    expect(isAuthorized(undefined, 's3cret-value')).toBe(false);
  });

  it('refuses a header that is a prefix or an extension of the secret', () => {
    expect(isAuthorized('Bearer s3cret', 's3cret-value')).toBe(false);
    expect(isAuthorized('Bearer s3cret-value!', 's3cret-value')).toBe(false);
  });

  it('FAILS CLOSED when the secret is not set: "Bearer undefined" gets nothing', () => {
    expect(isAuthorized('Bearer undefined', undefined)).toBe(false);
    expect(isAuthorized('Bearer ', undefined)).toBe(false);
    expect(isAuthorized('Bearer ', '')).toBe(false);
    expect(isAuthorized('Bearer    ', '   ')).toBe(false);
    expect(isAuthorized(null, undefined)).toBe(false);
  });
});

describe('isAuthorizedCron', () => {
  const env = process.env as Record<string, string | undefined>;
  const saved: Record<string, string | undefined> = {};
  beforeEach(() => {
    saved.CRON_SECRET = env.CRON_SECRET;
    saved.PUSH_WEBHOOK_SECRET = env.PUSH_WEBHOOK_SECRET;
  });
  afterEach(() => {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete env[k];
      else env[k] = saved[k];
    }
  });

  const req = (header?: string) => new Request('https://app.example.com/api/cron/x', { headers: header ? { authorization: header } : {} });

  it('reads CRON_SECRET by default', () => {
    env.CRON_SECRET = 'abc123';
    expect(isAuthorizedCron(req('Bearer abc123'))).toBe(true);
    expect(isAuthorizedCron(req('Bearer abc124'))).toBe(false);
  });

  it('reads PUSH_WEBHOOK_SECRET for the push route, and not the other secret', () => {
    env.CRON_SECRET = 'cron-secret';
    env.PUSH_WEBHOOK_SECRET = 'push-secret';
    expect(isAuthorizedCron(req('Bearer push-secret'), 'PUSH_WEBHOOK_SECRET')).toBe(true);
    expect(isAuthorizedCron(req('Bearer cron-secret'), 'PUSH_WEBHOOK_SECRET')).toBe(false);
  });

  it('refuses everything while the secret is unset', () => {
    delete env.CRON_SECRET;
    expect(isAuthorizedCron(req('Bearer undefined'))).toBe(false);
    expect(isAuthorizedCron(req())).toBe(false);
  });
});
