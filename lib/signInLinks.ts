import type { SupabaseClient } from '@supabase/supabase-js';

// D22 (SE8, decision of 11 Nov 2026): the one-time "choose a password" links stay visible to whoever makes them, but every one is
// recorded in sign_in_links (migration 0171): who made it, for whom, at which gym, when. The gym's admins and the owner can read the
// record; the owner sees the recent ones on the gym's Team tab.
//
// Not a 'use server' module on purpose: nothing here may be called straight from the browser.

export type SignInLinkKind = 'member' | 'new_coach';

export const LINK_NOT_RECORDED = 'The sign-in link could not be recorded, so it was not made. Please try again.';

// Records one link, with the service role (nobody signed in can write the table). Called after the caller's checks and BEFORE the link is
// shown or emailed: false means it was not recorded, and the link must not be given out.
export async function recordSignInLink(
  admin: SupabaseClient,
  row: { gymId: string | null; madeBy: string; madeFor: string; kind: SignInLinkKind }
): Promise<boolean> {
  const { error } = await admin.from('sign_in_links').insert({ gym_id: row.gymId, made_by: row.madeBy, made_for: row.madeFor, kind: row.kind });
  return !error;
}

export interface SignInLinkRow {
  id: string;
  kind: SignInLinkKind;
  createdAt: string;
  madeById: string | null;
  madeByName: string | null;
  madeForId: string | null;
  madeForName: string | null;
}

// The gym's recent links, newest first, as the signed-in owner or gym admin (gym_sign_in_links checks it). null when they cannot be read
// (the migration is not run yet, or the caller may not see them).
export async function getGymSignInLinks(supabase: SupabaseClient, gymId: string, limit = 20): Promise<SignInLinkRow[] | null> {
  const { data, error } = await supabase.rpc('gym_sign_in_links', { p_gym: gymId, p_limit: limit });
  if (error) return null;
  return ((data ?? []) as {
    id: string;
    kind: string;
    created_at: string;
    made_by: string | null;
    made_by_name: string | null;
    made_for: string | null;
    made_for_name: string | null;
  }[]).map((r) => ({
    id: r.id,
    kind: r.kind === 'new_coach' ? 'new_coach' : 'member',
    createdAt: r.created_at,
    madeById: r.made_by,
    madeByName: r.made_by_name,
    madeForId: r.made_for,
    madeForName: r.made_for_name,
  }));
}

// "Sam Coach made a link for Jo Member" / "... for new coach Alex". An account removed since is named as such.
export function describeSignInLink(row: Pick<SignInLinkRow, 'kind' | 'madeByName' | 'madeForName'>): string {
  const by = row.madeByName?.trim() || 'Someone no longer here';
  if (row.kind === 'new_coach') return `${by} made a link for new coach ${row.madeForName?.trim() || '(account removed)'}`;
  return `${by} made a link for ${row.madeForName?.trim() || 'a member no longer here'}`;
}
