import { describe, expect, it, vi } from 'vitest';
import {
  COULD_NOT_CHECK,
  NEED_CURRENT_PASSWORD,
  TOO_MANY_TRIES,
  WRONG_CURRENT_PASSWORD,
  checkCurrentPassword,
  currentPasswordProblem,
  newPasswordProblem,
} from './currentPassword';

// A stand-in for the separate auth client: answers the sign-in with `error` and records the calls.
function fakeAuth(error: { code?: string; status?: number; message?: string } | null, opts: { throws?: boolean } = {}) {
  const signInWithPassword = vi.fn(async () => {
    if (opts.throws) throw new Error('network down');
    return { data: { user: null, session: null }, error };
  });
  const signOut = vi.fn(async () => ({ error: null }));
  return { auth: { signInWithPassword, signOut } as never, signInWithPassword, signOut };
}

describe('currentPasswordProblem', () => {
  it('is null when the sign-in went through', () => {
    expect(currentPasswordProblem(null)).toBeNull();
  });

  it('says the password is wrong for bad credentials', () => {
    expect(currentPasswordProblem({ code: 'invalid_credentials', status: 400, message: 'Invalid login credentials' })).toBe(WRONG_CURRENT_PASSWORD);
    expect(currentPasswordProblem({ status: 400, message: 'Invalid login credentials' })).toBe(WRONG_CURRENT_PASSWORD);
  });

  it('says to wait when rate limited', () => {
    expect(currentPasswordProblem({ status: 429, message: 'Request rate limit reached' })).toBe(TOO_MANY_TRIES);
    expect(currentPasswordProblem({ code: 'over_request_rate_limit' })).toBe(TOO_MANY_TRIES);
  });

  it('asks to try again for anything else', () => {
    expect(currentPasswordProblem({ status: 500, message: 'boom' })).toBe(COULD_NOT_CHECK);
  });
});

describe('newPasswordProblem', () => {
  it('needs the current password first', () => {
    expect(newPasswordProblem('', 'new-password-1', 'new-password-1')).toBe(NEED_CURRENT_PASSWORD);
  });

  it('keeps the existing length and match rules', () => {
    expect(newPasswordProblem('old-pass', 'short', 'short')).toMatch(/at least 8/);
    expect(newPasswordProblem('old-pass', 'new-password-1', 'new-password-2')).toMatch(/do not match/);
  });

  it('refuses a new password that is the current one', () => {
    expect(newPasswordProblem('same-password', 'same-password', 'same-password')).toMatch(/same as your current/);
  });

  it('is null for a good change', () => {
    expect(newPasswordProblem('old-pass-1', 'new-password-1', 'new-password-1')).toBeNull();
  });
});

describe('checkCurrentPassword', () => {
  it('passes a right password and ends the extra session only', async () => {
    const f = fakeAuth(null);
    expect(await checkCurrentPassword('sam@example.com', 'right-one', f.auth)).toBeNull();
    expect(f.signInWithPassword).toHaveBeenCalledWith({ email: 'sam@example.com', password: 'right-one' });
    expect(f.signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('refuses a wrong password and has no session to end', async () => {
    const f = fakeAuth({ code: 'invalid_credentials', status: 400 });
    expect(await checkCurrentPassword('sam@example.com', 'wrong', f.auth)).toBe(WRONG_CURRENT_PASSWORD);
    expect(f.signOut).not.toHaveBeenCalled();
  });

  it('sends nothing without a password or an address', async () => {
    const f = fakeAuth(null);
    expect(await checkCurrentPassword('sam@example.com', '', f.auth)).toBe(NEED_CURRENT_PASSWORD);
    expect(await checkCurrentPassword('', 'right-one', f.auth)).toBe(COULD_NOT_CHECK);
    expect(f.signInWithPassword).not.toHaveBeenCalled();
  });

  it('turns a dropped connection into "try again"', async () => {
    const f = fakeAuth(null, { throws: true });
    expect(await checkCurrentPassword('sam@example.com', 'right-one', f.auth)).toBe(COULD_NOT_CHECK);
  });
});
