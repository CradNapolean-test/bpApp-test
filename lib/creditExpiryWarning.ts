import type { PushPayload } from '@/lib/push';

// The warning a member gets a few days before bonus credits expire (RO16). The daily expiry job (app/api/cron/expire-credits) calls
// warn_expiring_bonus_credits (migration 0177) right after expire_bonus_credits. The database writes the in-app notice and records the
// grant in the same transaction, so each grant is warned about once, whatever the job does next or how often it runs; it answers what
// it warned about, and this sends the same words by push, as the app does when credits are added (notifyCreditsAdded). Server-only.

// How far ahead: grants expiring in the next 3 days. The job runs once a day (03:30 UTC), so a grant that expires at the end of a day at
// the gym is warned about 2 to 3 days before, and one given with less time than that is warned about on the next run.
export const EXPIRY_WARNING_DAYS = 3;

export interface ExpiryWarning {
  member_id: string;
  grant_id: string;
  credits_left: number;
  grant_expires_at: string;
  notice: string;
}

export function expiryWarningPush(w: ExpiryWarning): PushPayload {
  const n = Math.max(1, Math.round(w.credits_left));
  return {
    title: n === 1 ? 'A bonus credit expires soon' : `${n} bonus credits expire soon`,
    body: w.notice,
    url: '/dashboard?open=book',
    // One per grant: a phone replaces rather than stacks a second copy of the same warning.
    tag: `credits-expiring-${w.grant_id}`,
  };
}

interface WarningRpc {
  rpc(fn: 'warn_expiring_bonus_credits', args: { p_days: number }): PromiseLike<{ data: unknown; error: { code?: string | null; message?: string } | null }>;
}

export type ExpiryWarningResult =
  | { state: 'sent'; warned: number }
  // Migration 0177 is not applied yet: nothing is warned, and the expiry itself still ran.
  | { state: 'not available' }
  | { state: 'failed'; error: string };

const MISSING_FUNCTION = new Set(['PGRST202', '42883']);
const PUSH_BATCH = 10;

// Warns about the grants the database has not warned about yet, and pushes each warning once. Never throws.
export async function sendExpiryWarnings(
  client: WarningRpc,
  push: (memberId: string, payload: PushPayload) => Promise<unknown>,
  days: number = EXPIRY_WARNING_DAYS
): Promise<ExpiryWarningResult> {
  try {
    const { data, error } = await client.rpc('warn_expiring_bonus_credits', { p_days: days });
    if (error) {
      if (error.code && MISSING_FUNCTION.has(error.code)) return { state: 'not available' };
      return { state: 'failed', error: error.message || 'warn_expiring_bonus_credits failed' };
    }
    const rows = (Array.isArray(data) ? data : []) as ExpiryWarning[];
    // The database answers each grant once; a repeated row would still only be pushed once.
    const byGrant = new Map<string, ExpiryWarning>();
    for (const r of rows) if (r?.grant_id && r.member_id && !byGrant.has(r.grant_id)) byGrant.set(r.grant_id, r);
    const warnings = [...byGrant.values()];
    for (let i = 0; i < warnings.length; i += PUSH_BATCH) {
      await Promise.all(
        warnings.slice(i, i + PUSH_BATCH).map((w) =>
          push(w.member_id, expiryWarningPush(w)).catch(() => {
            // Best effort: the in-app notice is already there.
          })
        )
      );
    }
    return { state: 'sent', warned: warnings.length };
  } catch (err) {
    return { state: 'failed', error: err instanceof Error ? err.message : String(err) };
  }
}

// The job's one-line record of the warnings (job_runs).
export function expiryWarningDetail(result: ExpiryWarningResult): string {
  if (result.state === 'sent') return `warnings: ${result.warned}`;
  if (result.state === 'not available') return 'warnings: not available (migration 0177)';
  return `warnings failed: ${result.error}`;
}
