import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js';

// SE22: changing your password or email asks for your current password first, so a phone or laptop left signed in cannot be used to take
// the login over. The check signs in once more with a separate client that keeps nothing (no cookie, no stored session), so the page's own
// sign-in is untouched, and then ends that extra session. Supabase's "Secure password change" and "Secure email change" settings are the
// server-side lock (FIX_PLAN item 10, for the owner to switch on); this is the check the forms make either way.

export const NEED_CURRENT_PASSWORD = 'Enter your current password.';
export const WRONG_CURRENT_PASSWORD = 'That is not your current password.';
export const TOO_MANY_TRIES = 'Too many tries. Wait a few minutes, then try again.';
export const COULD_NOT_CHECK = 'We could not check your current password. Please try again.';

type SignInError = { code?: string; status?: number; message?: string } | null;

// The sentence for a failed check, or null when the sign-in went through.
export function currentPasswordProblem(error: SignInError): string | null {
  if (!error) return null;
  if (error.status === 429 || error.code === 'over_request_rate_limit') return TOO_MANY_TRIES;
  if (error.code === 'invalid_credentials' || error.status === 400) return WRONG_CURRENT_PASSWORD;
  return COULD_NOT_CHECK;
}

// What is wrong with a password change before anything is sent, or null.
export function newPasswordProblem(current: string, next: string, confirm: string): string | null {
  if (!current) return NEED_CURRENT_PASSWORD;
  if (next.length < 8) return 'Password must be at least 8 characters.';
  if (next !== confirm) return 'Passwords do not match.';
  if (next === current) return 'The new password is the same as your current one.';
  return null;
}

type CheckerAuth = Pick<SupabaseClient['auth'], 'signInWithPassword' | 'signOut'>;

function throwawayAuth(): CheckerAuth {
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'bp-current-password-check' },
  }).auth;
}

// Null when `password` is the current password for `email` (the signed-in person's own address, read from their session); otherwise the
// sentence to show. `auth` is for tests.
export async function checkCurrentPassword(email: string, password: string, auth?: CheckerAuth): Promise<string | null> {
  if (!password) return NEED_CURRENT_PASSWORD;
  if (!email) return COULD_NOT_CHECK;
  try {
    const checker = auth ?? throwawayAuth();
    const { error } = await checker.signInWithPassword({ email, password });
    const problem = currentPasswordProblem(error);
    if (problem) return problem;
    // The extra session is not needed: end just that one (scope "local"); the page stays signed in.
    await checker.signOut({ scope: 'local' }).catch(() => undefined);
    return null;
  } catch {
    return COULD_NOT_CHECK;
  }
}
