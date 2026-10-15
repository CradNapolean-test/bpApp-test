// Whether email can really be sent, and from which address (CM1). Pure, so it can be tested without a mail provider.
//
// In production an unset RESEND_FROM_EMAIL used to fall back to Resend's shared sandbox sender, which only delivers to the Resend account's
// own address: every member's email was rejected while the coach was told it had gone. Now email in production is "not configured" until a
// real sender is set. Outside production the sandbox sender is still allowed, so a developer with a key can try the flow.

export const SANDBOX_SENDER = 'Ballistic Performance <onboarding@resend.dev>';

export type EmailSkipReason = 'no-key' | 'sender-not-configured';

export type SenderCheck = { ok: true; from: string; sandbox: boolean } | { ok: false; reason: EmailSkipReason };

export interface EmailEnv {
  RESEND_API_KEY?: string;
  RESEND_FROM_EMAIL?: string;
  NODE_ENV?: string;
}

export function checkSender(env: EmailEnv): SenderCheck {
  if (!env.RESEND_API_KEY?.trim()) return { ok: false, reason: 'no-key' };
  const from = env.RESEND_FROM_EMAIL?.trim();
  if (from) return { ok: true, from, sandbox: false };
  if (env.NODE_ENV === 'production') return { ok: false, reason: 'sender-not-configured' };
  return { ok: true, from: SANDBOX_SENDER, sandbox: true };
}

// What to tell the coach when nothing was sent because email is not ready.
export function skipSentence(reason: EmailSkipReason | undefined): string {
  if (reason === 'sender-not-configured') return 'Email is not set up for this gym yet.';
  if (reason === 'no-key') return 'Email is not switched on for this app yet.';
  return 'Email could not be sent.';
}
