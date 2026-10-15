// The public sign-up endpoint behind a coach's link (M7, DECISION D17): what it checks, and what it says. Plain functions so the rules are
// tested. The rule that matters most: it never tells a stranger whether an email address already has an account.

// One sentence for every account-creation failure that is not the person's own typing mistake. The real reason goes to Sentry.
export const JOIN_NEUTRAL_MESSAGE = 'We could not create your account. Check your details or ask your coach.';
export const JOIN_RATE_MESSAGE = 'Too many attempts. Please wait a while and try again.';
export const JOIN_LINK_MESSAGE = 'This sign-up link is no longer active. Ask your coach for a new one.';
export const JOIN_MAIL_BUSY_MESSAGE = 'We are sending a lot of confirmation emails right now. Please try again in a little while.';

export type JoinFailure = 'invalid-email' | 'weak-password' | 'bad-link' | 'ip-limit' | 'link-limit' | 'mail-busy' | 'exists' | 'create-failed' | 'profile-failed';

export function joinFailure(kind: JoinFailure): { status: number; error: string } {
  switch (kind) {
    case 'invalid-email':
      return { status: 400, error: 'Please enter a valid email address.' };
    case 'weak-password':
      return { status: 400, error: 'Your password needs at least 8 characters.' };
    case 'bad-link':
      return { status: 400, error: JOIN_LINK_MESSAGE };
    case 'ip-limit':
    case 'link-limit':
      return { status: 429, error: JOIN_RATE_MESSAGE };
    case 'mail-busy':
      return { status: 429, error: JOIN_MAIL_BUSY_MESSAGE };
    // An existing address, a refused password, a database error: all the same sentence, so the response says nothing about who has an account.
    case 'exists':
    case 'create-failed':
    case 'profile-failed':
      return { status: 400, error: JOIN_NEUTRAL_MESSAGE };
  }
}

export type JoinInput = { ok: true; token: string; email: string; password: string } | { ok: false; failure: JoinFailure };

export function validateJoinInput(body: unknown): JoinInput {
  const b = (body ?? {}) as { token?: unknown; email?: unknown; password?: unknown };
  const token = typeof b.token === 'string' ? b.token.trim() : '';
  const email = String(b.email ?? '').trim().toLowerCase();
  const password = String(b.password ?? '');
  if (!token || token.length > 200) return { ok: false, failure: 'bad-link' };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) return { ok: false, failure: 'invalid-email' };
  if (password.length < 8 || password.length > 200) return { ok: false, failure: 'weak-password' };
  return { ok: true, token, email, password };
}

export interface LinkRow {
  active: boolean;
  expires_at?: string | null;
  max_uses_per_day?: number | null;
}

export function linkUsable(link: LinkRow | null | undefined, nowMs: number): 'ok' | 'missing' | 'inactive' | 'expired' {
  if (!link) return 'missing';
  if (!link.active) return 'inactive';
  if (link.expires_at && new Date(link.expires_at).getTime() <= nowMs) return 'expired';
  return 'ok';
}

export const DEFAULT_LINK_DAILY_LIMIT = 50;
export const IP_ATTEMPTS_PER_HOUR = 5;

export const linkDailyLimit = (link: LinkRow): number => {
  const n = link.max_uses_per_day;
  return typeof n === 'number' && n >= 1 ? n : DEFAULT_LINK_DAILY_LIMIT;
};

// D17 default: a new member confirms their email before signing in. JOIN_EMAIL_CONFIRMATION=false keeps the one-step flow (the address is
// marked verified without proof, so the limits above are then the only protection).
export function confirmationRequired(setting: string | undefined): boolean {
  return (setting ?? '').trim().toLowerCase() !== 'false';
}

// Supabase's own wording when its mailer is out of sends for the hour.
export function isMailRateLimit(error: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'over_email_send_rate_limit' || error.code === 'over_request_rate_limit' || error.status === 429 || /rate limit/i.test(error.message ?? '');
}

// signUp does not say "that address exists": for an address with a confirmed account it returns a user with no identities. Treat that as
// the same outcome as a new sign-up, so the page cannot be used to find out who has an account.
export function isExistingAccountAnswer(user: { identities?: unknown[] | null } | null | undefined): boolean {
  return !!user && Array.isArray(user.identities) && user.identities.length === 0;
}
