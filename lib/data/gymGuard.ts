import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopingGymId } from './coach';
import { fail, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';

// A coach has one active gym at a time, stored on their profile, and the database uses it to decide where a new
// plan, session, group or broadcast goes. Two browser tabs share that one setting: switch gym in tab A and tab B,
// still showing the old gym, would write into the new one. Every write that creates or changes gym records is given
// the gym its page was drawn for and refuses when that is no longer the active gym (R28).
//
// Not a 'use server' module on purpose: nothing here may be called straight from the browser.

export const GYM_CHANGED_MESSAGE = 'You changed gym in another tab. Reload this page.';

export class GymChangedError extends Error {
  constructor() {
    super(GYM_CHANGED_MESSAGE);
    this.name = 'GymChangedError';
  }
}

// true when the write may go ahead. A page that did not know its gym (nothing was passed) cannot be checked.
export function gymMatches(expectedGymId: string | null | undefined, activeGymId: string | null | undefined): boolean {
  if (!expectedGymId) return true;
  return activeGymId != null && activeGymId === expectedGymId;
}

// Throws GymChangedError when the coach's active gym is not the one the page was drawn for.
export async function assertActiveGym(supabase: SupabaseClient, expectedGymId: string | null | undefined): Promise<void> {
  if (!expectedGymId) return;
  const activeGymId = await resolveScopingGymId(supabase);
  if (!gymMatches(expectedGymId, activeGymId)) throw new GymChangedError();
}

// Same check, as the value a Server Action can hand back. Next.js replaces the message of anything thrown out of a
// Server Action with a generic one in production, and this message has to be read (see result.ts), so a refusal is
// returned: { ok: false, error } is what useAction already shows. null means carry on.
export async function checkActiveGym(supabase: SupabaseClient, expectedGymId: string | null | undefined): Promise<ActionResult | null> {
  try {
    await assertActiveGym(supabase, expectedGymId);
    return null;
  } catch (err) {
    if (err instanceof GymChangedError) return fail(err);
    throw err;
  }
}

// Wrapper for a write that has no Supabase client of its own yet: runs fn only when the gym still matches.
// A refusal comes back as { ok: false, error }, like checkActiveGym.
export async function withGymGuard<T>(
  expectedGymId: string | null | undefined,
  fn: (supabase: SupabaseClient) => Promise<T>
): Promise<T | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  return fn(supabase);
}
