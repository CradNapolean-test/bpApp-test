import { timingSafeEqual } from 'node:crypto';

// The shared-secret check for the routes that are called by a machine, not a signed-in person: the daily jobs (CRON_SECRET, sent by Vercel
// Cron as "Authorization: Bearer <secret>") and /api/push/send (PUSH_WEBHOOK_SECRET). M13.
//
// It fails CLOSED. The old check compared the header with `Bearer ${process.env.CRON_SECRET}`: with the variable unset that is the string
// "Bearer undefined", which any caller can send, and the middleware lets /api/cron/* through without a login. Now an unset or empty secret
// refuses everyone, and the comparison does not leak how many characters matched.

export function isAuthorized(header: string | null | undefined, secret: string | undefined): boolean {
  if (!secret || secret.trim() === '') return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header ?? '');
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function isAuthorizedCron(request: Request, secretName: 'CRON_SECRET' | 'PUSH_WEBHOOK_SECRET' = 'CRON_SECRET'): boolean {
  return isAuthorized(request.headers.get('authorization'), process.env[secretName]);
}
