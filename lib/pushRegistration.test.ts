import { describe, expect, it, vi } from 'vitest';
import { REREGISTER_EVERY_MS, registrationKey, shouldReregister, withTimeout } from './pushRegistration';

describe('shouldReregister (R18)', () => {
  const now = 1_000_000_000_000;
  it('registers when it never has, or the stored time is unreadable', () => {
    expect(shouldReregister(null, now)).toBe(true);
    expect(shouldReregister(Number.NaN, now)).toBe(true);
  });
  it('waits half a day between registrations', () => {
    expect(shouldReregister(now - 60_000, now)).toBe(false);
    expect(shouldReregister(now - REREGISTER_EVERY_MS, now)).toBe(true);
  });
  it('keeps a key per person, so a second member on the same phone registers on their own', () => {
    expect(registrationKey('a')).not.toBe(registrationKey('b'));
  });
});

describe('withTimeout', () => {
  it('passes the value through when it is quick', async () => {
    await expect(withTimeout(Promise.resolve(7), 50)).resolves.toBe(7);
  });
  it('gives up on something that never finishes', async () => {
    vi.useFakeTimers();
    const pending = withTimeout(new Promise<number>(() => {}), 1500);
    const assertion = expect(pending).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(1600);
    await assertion;
    vi.useRealTimers();
  });
  it('passes a failure through', async () => {
    await expect(withTimeout(Promise.reject(new Error('boom')), 50)).rejects.toThrow('boom');
  });
});
