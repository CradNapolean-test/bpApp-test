import { createHash } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';

// "N tries per window" without an outside service (M7, M13, D13): one counter per key and time window in the database (rate_limits,
// migration 0140), bumped atomically by rate_limit_hit. The decision is made here from the count that comes back, with the clock passed in so
// it can be tested.

export interface RateStore {
  // Counts one more use of `key` in the window that starts at `windowStartIso`, and returns how many there have been in it, this one included.
  hit(key: string, windowStartIso: string, windowSeconds: number): Promise<number>;
}

export interface RateDecision {
  allowed: boolean;
  // Uses left in this window after this one.
  remaining: number;
  // How long until the window resets.
  retryAfterSeconds: number;
}

// Windows are fixed slots on the clock (the hour from 14:00 to 15:00), not "the last 60 minutes".
export function windowStartMs(nowMs: number, windowSeconds: number): number {
  const size = windowSeconds * 1000;
  return Math.floor(nowMs / size) * size;
}

export function decide(count: number, limit: number, nowMs: number, windowSeconds: number): RateDecision {
  const start = windowStartMs(nowMs, windowSeconds);
  return {
    allowed: count <= limit,
    remaining: Math.max(0, limit - count),
    retryAfterSeconds: Math.max(1, Math.ceil((start + windowSeconds * 1000 - nowMs) / 1000)),
  };
}

export interface TakeOptions {
  // What to do when the counter cannot be reached (database down, migration not applied yet): let the request through or refuse it.
  // Sign-up fails open (a broken counter must not stop new members); anything that costs money or exports data fails closed.
  onError?: 'allow' | 'deny';
  nowMs?: number;
  onFailure?: (error: unknown) => void;
}

export async function takeToken(store: RateStore, key: string, limit: number, windowSeconds: number, options: TakeOptions = {}): Promise<RateDecision> {
  const nowMs = options.nowMs ?? Date.now();
  try {
    const count = await store.hit(key, new Date(windowStartMs(nowMs, windowSeconds)).toISOString(), windowSeconds);
    return decide(count, limit, nowMs, windowSeconds);
  } catch (error) {
    options.onFailure?.(error);
    const allowed = (options.onError ?? 'deny') === 'allow';
    return { allowed, remaining: allowed ? limit : 0, retryAfterSeconds: windowSeconds };
  }
}

// The store the server uses. Needs the service role: rate_limit_hit is not callable by signed-in users.
export function adminRateStore(): RateStore {
  const admin = createAdminClient();
  return {
    async hit(key, windowStartIso, windowSeconds) {
      const { data, error } = await admin.rpc('rate_limit_hit', { p_key: key, p_window_start: windowStartIso, p_window_seconds: windowSeconds });
      if (error) throw new Error(error.message);
      return Number(data);
    },
  };
}

// The caller's address from the forwarded header (Vercel sets it), shortened to a hash so no address is stored. A hash of an address is
// easy to guess, so this is a courtesy, not anonymity: the rows are swept after two days.
export function clientIpKey(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

export const HOUR = 3600;
export const DAY = 86400;
