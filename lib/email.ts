import { Resend } from 'resend';
import * as Sentry from '@sentry/nextjs';
import { personaliseMessage } from '@/lib/broadcastMessages';
import { checkSender, type EmailSkipReason } from '@/lib/emailConfig';
import { signUnsubscribeToken, unsubscribeUrl } from '@/lib/unsubscribeToken';
import { scrubAddresses } from '@/lib/scrub';
import type { EmailResult } from '@/lib/emailOutcome';

// Server-only. Missing configuration means "skip sending, and say so" rather than throwing or pretending: callers (composeCommunication,
// the send-communications cron route) already deliver the in-app message, so a broadcast should not fail outright because email is not
// set up yet, but the coach must be told that the email did not go (CM1). What counts as "set up" is decided in lib/emailConfig.ts:
// RESEND_API_KEY and, in production, a real RESEND_FROM_EMAIL on a verified domain.
//
// Never log or report an email address from here: counts and the provider's error text (with addresses removed) only.
const BATCH_SIZE = 100; // Resend's batch endpoint caps at 100 emails per call.

export type { EmailResult } from '@/lib/emailOutcome';
// Kept under its old name for callers that import it.
export type BroadcastEmailResult = EmailResult;

function senderCheck() {
  return checkSender({
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    RESEND_FROM_EMAIL: process.env.RESEND_FROM_EMAIL,
    NODE_ENV: process.env.NODE_ENV,
  });
}

export { scrubAddresses };

function errorText(error: unknown): string {
  if (error && typeof error === 'object' && 'message' in error) return scrubAddresses(String((error as { message?: unknown }).message ?? 'unknown error'));
  return scrubAddresses(String(error ?? 'unknown error'));
}

// The address people open for the unsubscribe link: set NEXT_PUBLIC_SITE_URL, else Vercel's own production address.
export function appOrigin(): string | null {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || process.env.VERCEL_URL?.trim();
  return vercel ? `https://${vercel}` : null;
}

// Shared by both call sites (composeCommunication's immediate-send path and the cron route's
// scheduled-send pass) -- no explicit subject field on the compose form, so it's derived from
// the message itself, same "don't ask for input the message already implies" call as elsewhere
// this session.
export function subjectFromMessage(message: string): string {
  const trimmed = message.trim();
  if (trimmed.length === 0) return 'A message from your coach';
  return trimmed.length > 60 ? `${trimmed.slice(0, 60)}…` : trimmed;
}

export function messageToHtml(message: string): string {
  const escaped = message.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<p>${escaped.replace(/\n/g, '<br />')}</p>`;
}

const escapeAttribute = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;');

export interface PersonalisedRecipient {
  email: string;
  name: string | null;
  // The member's id: lets the email carry an unsubscribe link that switches email off for this member only.
  memberId?: string;
}

export interface SendOptions {
  // Where a reply goes: the coach who sent the broadcast.
  replyTo?: string;
}

function skippedResult(reason: EmailSkipReason): EmailResult {
  return { sent: 0, failed: 0, skipped: true, reason };
}

// Sends one batch call and says how many of its emails went. A thrown error and an error answer are the same thing: the whole batch failed.
type BatchEmail = { from: string; to: string; subject: string; html: string; replyTo?: string; headers?: Record<string, string> };

async function sendBatches(resend: Resend, emails: BatchEmail[]): Promise<EmailResult> {
  let sent = 0;
  let failed = 0;
  let error: string | undefined;
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const chunk = emails.slice(i, i + BATCH_SIZE);
    try {
      const { error: providerError } = await resend.batch.send(chunk);
      if (providerError) throw providerError;
      sent += chunk.length;
    } catch (err) {
      failed += chunk.length;
      const message = errorText(err);
      error ??= message;
      // Counts and the provider's reason only: never an address.
      Sentry.captureMessage('Email batch failed', { level: 'error', tags: { area: 'email' }, extra: { emails: chunk.length, providerMessage: message } });
    }
  }
  return { sent, failed, skipped: false, ...(error ? { error } : {}) };
}

// A message to many people, personalised for each ("{first name}") before it is turned into their email. Each email carries a
// List-Unsubscribe header (and the one-click form) and a footer link when the app can sign one (UNSUBSCRIBE_SECRET and a known address).
export async function sendPersonalisedEmails(
  recipients: PersonalisedRecipient[],
  message: string,
  subjectOverride?: string,
  options: SendOptions = {}
): Promise<EmailResult> {
  const sender = senderCheck();
  if (!sender.ok) return skippedResult(sender.reason);
  if (recipients.length === 0) return { sent: 0, failed: 0, skipped: false };

  const origin = appOrigin();
  const secret = process.env.UNSUBSCRIBE_SECRET;
  const emails: BatchEmail[] = recipients.map((r) => {
    const text = personaliseMessage(message, r.name);
    const token = r.memberId && origin ? signUnsubscribeToken(r.memberId, secret) : null;
    const link = token && origin ? unsubscribeUrl(origin, token) : null;
    const footer = link
      ? `<p style="color:#888;font-size:12px">You get this because you are a member. <a href="${escapeAttribute(link)}">Stop emails from the app</a>.</p>`
      : '';
    return {
      from: sender.from,
      to: r.email,
      subject: subjectOverride ?? subjectFromMessage(text),
      html: `${messageToHtml(text)}${footer}`,
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
      ...(link ? { headers: { 'List-Unsubscribe': `<${link}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' } } : {}),
    };
  });
  return sendBatches(new Resend(process.env.RESEND_API_KEY as string), emails);
}

// The same html to a list of addresses (a password link, for example). No unsubscribe footer: these are transactional.
export async function sendBroadcastEmail(recipients: { email: string }[], subject: string, html: string, options: SendOptions = {}): Promise<EmailResult> {
  const sender = senderCheck();
  if (!sender.ok) return skippedResult(sender.reason);
  if (recipients.length === 0) return { sent: 0, failed: 0, skipped: false };
  const emails: BatchEmail[] = recipients.map((r) => ({ from: sender.from, to: r.email, subject, html, ...(options.replyTo ? { replyTo: options.replyTo } : {}) }));
  return sendBatches(new Resend(process.env.RESEND_API_KEY as string), emails);
}

// A member's note to their coach. Reply-To is the member, so the coach's reply goes straight to them.
export async function sendCoachEmail(opts: {
  to: string;
  replyTo: string;
  memberName: string;
  subject: string;
  message: string;
}): Promise<{ sent: boolean; skipped: boolean; reason?: EmailSkipReason }> {
  const sender = senderCheck();
  if (!sender.ok) return { sent: false, skipped: true, reason: sender.reason };
  const who = opts.memberName.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  try {
    const { error } = await new Resend(process.env.RESEND_API_KEY as string).emails.send({
      from: sender.from,
      to: opts.to,
      replyTo: opts.replyTo,
      subject: `${opts.memberName}: ${opts.subject}`,
      html: `${messageToHtml(opts.message)}<p style="color:#888">Sent from the Ballistic Performance app by ${who}. Reply to answer them directly.</p>`,
    });
    if (error) {
      Sentry.captureMessage('Coach email failed', { level: 'error', tags: { area: 'email' }, extra: { providerMessage: errorText(error) } });
      return { sent: false, skipped: false };
    }
    return { sent: true, skipped: false };
  } catch (err) {
    Sentry.captureMessage('Coach email failed', { level: 'error', tags: { area: 'email' }, extra: { providerMessage: errorText(err) } });
    return { sent: false, skipped: false };
  }
}
