import { createHmac, timingSafeEqual } from 'node:crypto';

// The link at the bottom of a broadcast email (CM1, R2): /unsubscribe?t=<token>. The token proves the link was made by this server for
// that member without a login: it is the member's id and an HMAC of it, signed with UNSUBSCRIBE_SECRET. It has no expiry on purpose,
// because a link in an old email must keep working. It can only switch email OFF for that member, never read or change anything else.

const encode = (value: string) => Buffer.from(value, 'utf8').toString('base64url');

function sign(memberId: string, secret: string): string {
  return createHmac('sha256', secret).update(`unsubscribe:${memberId}`).digest('base64url');
}

export function signUnsubscribeToken(memberId: string, secret: string | undefined): string | null {
  if (!secret || !memberId) return null;
  return `${encode(memberId)}.${sign(memberId, secret)}`;
}

// The member id inside a token that was signed with this secret, or null for anything else (wrong secret, edited id, junk).
export function verifyUnsubscribeToken(token: string | null | undefined, secret: string | undefined): string | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let memberId: string;
  try {
    memberId = Buffer.from(parts[0], 'base64url').toString('utf8');
  } catch {
    return null;
  }
  if (!memberId) return null;
  const expected = Buffer.from(sign(memberId, secret));
  const given = Buffer.from(parts[1]);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  return memberId;
}

// The address a recipient opens: the app's own origin plus the token.
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin.replace(/\/+$/, '')}/unsubscribe?t=${encodeURIComponent(token)}`;
}
