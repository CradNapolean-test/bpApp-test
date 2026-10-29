// Rules for the "forgot password" flow in the phone app. The member asks for a code, types the code from the email, then
// chooses a new password (the password rules themselves are validateNewPassword in account.ts, the same as the web's).

// The emailed code is a project setting (6 digits by default, 8 on the sandbox project, up to 10), so accept any of them.
export const RESET_CODE_MIN = 6;
export const RESET_CODE_MAX = 10;
// Supabase will not send another reset email to the same address inside a minute, so the screen waits that long too.
export const RESEND_SECONDS = 60;

// Not a full address check (the server does that), just enough to catch a typo before asking for an email.
export function validateResetEmail(email: string): string | null {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim()) ? null : 'Please enter the email address you sign in with.';
}

// People paste codes with spaces or a dash ("123 456"); keep only the digits.
export function cleanResetCode(input: string): string {
  return input.replace(/\D/g, '').slice(0, RESET_CODE_MAX);
}

export function validateResetCode(input: string): string | null {
  const code = cleanResetCode(input);
  if (code.length < RESET_CODE_MIN) return 'Enter the whole code from the email.';
  return null;
}

type Param = string | string[] | undefined;
const first = (v: Param) => (Array.isArray(v) ? v[0] : v);

// The reset link can open the app as ballistic://reset-password?token_hash=...&type=recovery. Only a recovery link with a
// plausible token is accepted; anything else (a different type, a missing or odd-looking token) is ignored.
export function recoveryTokenFrom(params: { token_hash?: Param; type?: Param }): string | null {
  const type = first(params.type);
  const token = first(params.token_hash);
  if (type !== 'recovery' || !token) return null;
  return /^[A-Za-z0-9_-]{16,200}$/.test(token) ? token : null;
}

// Seconds still to wait before another email may be requested (0 when it is allowed).
export function resendWait(sentAt: number | null, now: number): number {
  if (sentAt === null) return 0;
  return Math.max(0, Math.ceil((sentAt + RESEND_SECONDS * 1000 - now) / 1000));
}
