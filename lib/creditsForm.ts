import { wallTimeToIso } from './broadcastSend';

// The pure rules behind the coach's Credits tab on a member's page (R27, CM9): what a typed amount or expiry date means, how a ledger
// row is described, and the wording of the "are you sure" boxes. The database enforces the same limits (grant_credits, remove_credits,
// migration 0133); these only let the screen say so before asking.

export const MAX_CREDITS_AT_A_TIME = 50;
export const EXTRA_SESSION_DAYS = 7;

// ---- the amount box ----
// Kept as text so the box can be cleared and retyped (it used to snap back to 1 the moment it was emptied).
export type AmountCheck = { ok: true; amount: number } | { ok: false; error: string };

export function parseCreditAmount(text: string): AmountCheck {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, error: 'Enter how many credits.' };
  if (!/^\d+$/.test(trimmed)) return { ok: false, error: 'Use a whole number of credits.' };
  const amount = Number(trimmed);
  if (amount < 1 || amount > MAX_CREDITS_AT_A_TIME) return { ok: false, error: `Use a number from 1 to ${MAX_CREDITS_AT_A_TIME}.` };
  return { ok: true, amount };
}

// ---- the expiry date ----
// "Expires on 20 Oct" means the end of the 20th AT THE GYM, not in the coach's browser (a coach away from the gym, or a laptop on the
// wrong timezone, would otherwise move the expiry by a day). Blank means it never expires.
export type ExpiryCheck = { ok: true; iso: string | null } | { ok: false; error: string };

export function expiryToIso(dateText: string, gymTimezone: string, now: Date = new Date()): ExpiryCheck {
  const trimmed = dateText.trim();
  if (trimmed === '') return { ok: true, iso: null };
  const iso = wallTimeToIso(`${trimmed}T23:59`, gymTimezone);
  if (!iso) return { ok: false, error: 'That is not a date.' };
  if (new Date(iso).getTime() <= now.getTime()) return { ok: false, error: 'The expiry date must be in the future.' };
  return { ok: true, iso };
}

// "Extra session" is one credit that lasts a week from now.
export function extraSessionExpiry(now: Date = new Date()): string {
  return new Date(now.getTime() + EXTRA_SESSION_DAYS * 86_400_000).toISOString();
}

// ---- the history ----
// manual: a coach or the system gave or took credits on purpose (grants, packs, removals).
// booking: a booking took credits or a cancellation gave them back.
// automatic: the weekly reset, expiries and the plan ending. After a few months these are most of the rows.
export type CreditKind = 'manual' | 'booking' | 'automatic';
export type CreditFilter = 'all' | CreditKind;

export function creditKind(row: { booking_id: string | null; granted_by: string | null }): CreditKind {
  if (row.booking_id != null) return 'booking';
  if (row.granted_by != null) return 'manual';
  return 'automatic';
}

export const CREDIT_FILTER_LABELS: Record<CreditFilter, string> = {
  all: 'All',
  manual: 'Manual',
  booking: 'Bookings',
  automatic: 'Resets',
};

// How a ledger row reads to a person: the weekly reset rows say "Weekly allowance reset" and the week, not the system's own wording.
export function friendlyCreditReason(reason: string): string {
  const m = reason.match(/^membership reset: week of (\d{4}-\d{2}-\d{2})/);
  if (m) return `Weekly allowance reset · week of ${new Date(`${m[1]}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`;
  return reason;
}

export const HISTORY_PAGE = 25;
export const PLAN_HISTORY_PAGE = 10;

// ---- the "are you sure" boxes ----
const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;

export function extraSessionConfirmation(memberName: string) {
  return {
    title: `Add an extra session for ${memberName}?`,
    body: `This adds 1 credit that expires in ${EXTRA_SESSION_DAYS} days. It shows in their history and cannot be undone, only taken off again.`,
    confirmLabel: 'Add the session',
  };
}

export function packConfirmation(memberName: string, pack: { name: string; credits: number; expires_after_days: number | null }) {
  return {
    title: `Give ${memberName} the "${pack.name}" pack?`,
    body: `This adds ${credits(pack.credits)}${pack.expires_after_days ? `, valid for ${pack.expires_after_days} days` : ', with no expiry'}. It shows in their history and cannot be undone, only taken off again.`,
    confirmLabel: 'Give the pack',
  };
}
