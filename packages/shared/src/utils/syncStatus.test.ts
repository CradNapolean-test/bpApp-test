import { describe, expect, it } from 'vitest';

import { isNetworkFailure, isTransientStatus, retryDelayMs, syncBanner } from './syncStatus';

describe('isNetworkFailure', () => {
  it('recognises the ways a request fails to reach the server', () => {
    expect(isNetworkFailure({ message: 'TypeError: Failed to fetch' })).toBe(true); // browsers (as supabase-js words it)
    expect(isNetworkFailure(new TypeError('Network request failed'))).toBe(true); // React Native
    expect(isNetworkFailure({ message: 'TypeError: Load failed' })).toBe(true); // Safari
    expect(isNetworkFailure({ message: 'BpNetworkError: no connection' })).toBe(true); // our own fetch wrapper
    expect(isNetworkFailure({ name: 'TimeoutError', message: 'The operation timed out' })).toBe(true);
    expect(isNetworkFailure({ message: 'AuthRetryableFetchError: fetch failed' })).toBe(true);
    expect(isNetworkFailure({ name: 'AuthRetryableFetchError', message: 'You seem to be offline.' })).toBe(true); // sign-in library
  });
  it('does not call a refusal by the server a network failure', () => {
    expect(isNetworkFailure({ code: '42501', message: 'new row violates row-level security policy for table "workout_logs"' })).toBe(false);
    expect(isNetworkFailure({ code: '23503', message: 'insert or update on table violates foreign key constraint' })).toBe(false);
    expect(isNetworkFailure(new Error('Your profile could not be updated.'))).toBe(false);
  });
  it('copes with odd values', () => {
    expect(isNetworkFailure(null)).toBe(false);
    expect(isNetworkFailure(undefined)).toBe(false);
    expect(isNetworkFailure('Failed to fetch')).toBe(false); // only error-shaped values count
    expect(isNetworkFailure({ message: 42 })).toBe(false);
  });
});

describe('isTransientStatus', () => {
  it('waits out "try again later" answers only', () => {
    for (const s of [502, 503, 504]) expect(isTransientStatus(s)).toBe(true);
    // 429 is a real answer (too many reset emails, too many sign-in tries), not a lost connection.
    for (const s of [200, 400, 401, 403, 404, 409, 422, 429, 500]) expect(isTransientStatus(s)).toBe(false);
  });
});

describe('retryDelayMs', () => {
  it('doubles from one second up to fifteen', () => {
    expect([0, 1, 2, 3, 4, 5, 10, 100].map(retryDelayMs)).toEqual([1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000]);
  });
  it('never goes negative or below a second', () => {
    expect(retryDelayMs(-3)).toBe(1000);
  });
});

describe('syncBanner', () => {
  it('says nothing when everything is saved and the phone is online', () => {
    expect(syncBanner({ online: true, waiting: 0, failed: 0 })).toBeNull();
  });
  it('tells an offline member that changes are waiting, in the singular and plural', () => {
    expect(syncBanner({ online: false, waiting: 1, failed: 0 })).toEqual({ tone: 'offline', text: 'You are offline. 1 change will save when you are back online.' });
    expect(syncBanner({ online: false, waiting: 3, failed: 0 })?.text).toBe('You are offline. 3 changes will save when you are back online.');
  });
  it('tells an offline member with nothing waiting what still works', () => {
    const b = syncBanner({ online: false, waiting: 0, failed: 0 });
    expect(b?.tone).toBe('offline');
    expect(b?.text).toContain('saved information');
  });
  it('shows saving only when online with writes still going out', () => {
    expect(syncBanner({ online: true, waiting: 2, failed: 0 })).toEqual({ tone: 'saving', text: 'Saving 2 changes...' });
  });
  it('puts a refused change before everything else', () => {
    expect(syncBanner({ online: false, waiting: 2, failed: 1 })).toEqual({ tone: 'problem', text: '1 change could not be saved and was undone.' });
    expect(syncBanner({ online: true, waiting: 0, failed: 2 })?.text).toBe('2 changes could not be saved and were undone.');
  });
});
