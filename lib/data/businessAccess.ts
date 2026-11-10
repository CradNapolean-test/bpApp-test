import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveScopingGymId } from './coach';
import { GYM_CHANGED_MESSAGE, gymMatches } from './gymGuard';
import { friendlyMessage } from './errors';
import type { ActionResult } from './result';

// Who may change a gym's plans, credit packs and rewards (decision D3, 6 Nov 2026): a coach with the Admin switch on for that gym
// (owner -> gym -> Team), or the owner. Every other coach sees them read-only. The database enforces the same rule
// (can_manage_gym_business, migration 0161); these checks run first so the screen gets a sentence instead of a refused write.
//
// Not a 'use server' module on purpose: nothing here may be called straight from the browser.

export type BusinessThing = 'plans' | 'credit packs' | 'rewards';

export function onlyAdminMessage(thing: BusinessThing): string {
  return `Only a gym admin can change ${thing}. The owner can switch Admin on for you on the gym's Team tab.`;
}

// Shown on Business to a coach who is not an admin of the gym they are looking at.
export const BUSINESS_READ_ONLY_NOTE = 'Only a gym admin or the owner can change plans, credit packs and rewards. Ask one of them if something needs changing.';

// What the function is called in the database, and the codes PostgREST and Postgres use when it is not there (0161 not run yet).
const FUNCTION_MISSING = ['PGRST202', '42883'];

// true when the signed-in person may change plans, packs and rewards at this gym.
export async function mayManageGymBusiness(supabase: SupabaseClient, gymId: string | null | undefined): Promise<boolean> {
  if (!gymId) return false;
  const { data, error } = await supabase.rpc('can_manage_gym_business', { p_gym: gymId });
  if (!error) return data === true;
  if (!FUNCTION_MISSING.includes(error.code ?? '')) return false;
  // Before migration 0161 is run: the same rule for a coach, from their own row for that gym (a coach can read their own rows).
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  const { data: row } = await supabase
    .from('coach_gym_memberships')
    .select('is_gym_admin')
    .eq('coach_id', user.id)
    .eq('gym_id', gymId)
    .maybeSingle();
  return row?.is_gym_admin === true;
}

export type BusinessWriteGym = { ok: true; gymId: string; asOwner: boolean } | { ok: false; refusal: ActionResult };

// The gym a plan, pack or reward write goes to, once the caller is allowed to make it there. A coach writes to their active gym, and the
// page must still be showing that gym (R28, lib/data/gymGuard.ts). The owner has no active gym, so their page names the gym.
export async function businessWriteGym(
  supabase: SupabaseClient,
  expectedGymId: string | null | undefined,
  thing: BusinessThing
): Promise<BusinessWriteGym> {
  const refuse = (error: string): BusinessWriteGym => ({ ok: false, refusal: { ok: false, error } });
  const activeGymId = await resolveScopingGymId(supabase);
  if (activeGymId && !gymMatches(expectedGymId, activeGymId)) return refuse(GYM_CHANGED_MESSAGE);
  const gymId = activeGymId ?? expectedGymId ?? null;
  if (!gymId || !(await mayManageGymBusiness(supabase, gymId))) return refuse(onlyAdminMessage(thing));
  return { ok: true, gymId, asOwner: !activeGymId };
}

// A database refusal as something to read: a row-level security refusal is the admin rule (0161), anything else keeps its own message.
export function businessWriteFailed(error: { code?: string; message?: string } | null, thing: BusinessThing, fallback: string): ActionResult {
  if (error?.code === '42501' || /row-level security/i.test(error?.message ?? '')) return { ok: false, error: onlyAdminMessage(thing) };
  const message = error?.message?.trim();
  return { ok: false, error: message ? friendlyMessage(message) : fallback };
}
