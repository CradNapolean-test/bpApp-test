'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { businessWriteFailed, businessWriteGym, onlyAdminMessage } from './businessAccess';
import { createClient } from '@/lib/supabase/server';
import { HISTORY_PAGE, type CreditFilter } from '@/lib/creditsForm';
import type { ClientMembershipRow, CreditPackRow, CreditsLedgerRow, MembershipPackageRow } from './types';

// The gym a member belongs to, which is not necessarily the gym their coach is working in right now (a coach in two gyms has
// one active gym at a time). Anything offered to a member (plans, packs, forms) must come from THIS gym (R38).
export async function getClientGymId(clientId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('gym_id').eq('id', clientId).maybeSingle();
  return (data?.gym_id as string | null | undefined) ?? null;
}

// The plans of one gym: for a member's page, the member's own gym, not whichever gym the coach has active.
export async function getPackagesForGym(gymId: string): Promise<MembershipPackageRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('membership_packages')
    .select('*')
    .eq('gym_id', gymId)
    .order('credits_per_week');
  if (error) raise(error);
  return data ?? [];
}

export async function getPackages(): Promise<MembershipPackageRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('membership_packages')
    .select('*')
    .eq('gym_id', gymId)
    .order('credits_per_week');
  if (error) raise(error);
  return data ?? [];
}

// expectedGymId (on every write here): the gym the page was drawn for; see lib/data/gymGuard.ts (R28). For the owner, who has no active
// gym, it is the gym they opened. Plans, packs and rewards are changed by a gym admin or the owner only (D3, lib/data/businessAccess.ts).
export async function createPackage(
  fields: Omit<MembershipPackageRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>,
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'plans');
  if (!gate.ok) return gate.refusal;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('membership_packages').insert({ ...fields, coach_id: user.id, gym_id: gate.gymId });
  if (error) return businessWriteFailed(error, 'plans', 'Could not add the plan');
}

export async function updatePackage(
  packageId: string,
  fields: Partial<Omit<MembershipPackageRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>>,
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'plans');
  if (!gate.ok) return gate.refusal;
  // .select() so a change the database refused (a plan at a gym where the caller is not an admin) is not reported as saved.
  const { data, error } = await supabase.from('membership_packages').update(fields).eq('id', packageId).select('id');
  if (error) return businessWriteFailed(error, 'plans', 'Could not save the plan');
  if (!data || data.length === 0) return fail(null, onlyAdminMessage('plans'));
}

// Members on each plan right now, by plan id, for every coach at the gym (migration 0101). Null when the function
// is not there yet, so the screen can fall back to what it already knows.
export async function getPlanMemberCounts(): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('plan_member_counts');
  if (error) return null;
  return Object.fromEntries((data ?? []).map((r: { package_id: string; member_count: number }) => [r.package_id, Number(r.member_count)]));
}

// How often each credit pack has been granted and when last (migration 0101).
export async function getPackUsage(): Promise<Record<string, { times: number; last: string | null }> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('credit_pack_usage');
  if (error) return null;
  return Object.fromEntries(
    (data ?? []).map((r: { pack_id: string; times_granted: number; last_granted: string | null }) => [r.pack_id, { times: Number(r.times_granted), last: r.last_granted }])
  );
}

// Members on each plan at one gym, for the owner (who has no active gym), through owner_plan_member_counts (migration 0161). Null when
// it cannot be read, like getPlanMemberCounts.
export async function getOwnerPlanMemberCounts(gymId: string): Promise<Record<string, number> | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_plan_member_counts', { p_gym: gymId });
  if (error) return null;
  return Object.fromEntries((data ?? []).map((r: { package_id: string; member_count: number }) => [r.package_id, Number(r.member_count)]));
}

export async function deletePackage(packageId: string, expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'plans');
  if (!gate.ok) return gate.refusal;
  // A plan with members on it cannot be deleted from here, whichever screen asks.
  const counts = gate.asOwner ? await getOwnerPlanMemberCounts(gate.gymId) : await getPlanMemberCounts();
  if (counts && (counts[packageId] ?? 0) > 0) {
    return fail({ message: `${counts[packageId]} member${counts[packageId] === 1 ? ' is' : 's are'} still on this plan. Move them to another plan first.` });
  }
  const { data, error } = await supabase.from('membership_packages').delete().eq('id', packageId).select('id');
  // Every plan a member has ever been on is kept for their plan history (client_memberships points at it).
  if (error?.code === '23503') return fail(null, 'Members have been on this plan before, so it is kept for their plan history and cannot be deleted.');
  if (error) return businessWriteFailed(error, 'plans', 'Could not delete the plan');
  if (!data || data.length === 0) return fail(null, onlyAdminMessage('plans'));
}

export async function getMyMembership(clientId: string): Promise<ClientMembershipRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_memberships')
    .select('*, package:membership_packages(*)')
    .eq('client_id', clientId)
    .is('ended_at', null)
    .maybeSingle();
  if (error) raise(error);
  return data as unknown as ClientMembershipRow | null;
}

export async function assignMembership(clientId: string, packageId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('assign_membership', {
    p_client_id: clientId,
    p_package_id: packageId,
  });
  return error ? fail(error, 'Could not assign that package') : ok();
}

export async function getCreditPacksForGym(gymId: string): Promise<CreditPackRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credit_packs')
    .select('*')
    .eq('gym_id', gymId)
    .order('credits');
  if (error) raise(error);
  return data ?? [];
}

export async function getCreditPacks(): Promise<CreditPackRow[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { data, error } = await supabase
    .from('credit_packs')
    .select('*')
    .eq('gym_id', gymId)
    .order('credits');
  if (error) raise(error);
  return data ?? [];
}

export async function createCreditPack(
  fields: Omit<CreditPackRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>,
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'credit packs');
  if (!gate.ok) return gate.refusal;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('credit_packs').insert({ ...fields, coach_id: user.id, gym_id: gate.gymId });
  if (error) return businessWriteFailed(error, 'credit packs', 'Could not add the pack');
}

export async function updateCreditPack(
  packId: string,
  fields: Partial<Omit<CreditPackRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>>,
  expectedGymId?: string | null
): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'credit packs');
  if (!gate.ok) return gate.refusal;
  const { data, error } = await supabase.from('credit_packs').update(fields).eq('id', packId).select('id');
  if (error) return businessWriteFailed(error, 'credit packs', 'Could not save the pack');
  if (!data || data.length === 0) return fail(null, onlyAdminMessage('credit packs'));
}

export async function deleteCreditPack(packId: string, expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const gate = await businessWriteGym(supabase, expectedGymId, 'credit packs');
  if (!gate.ok) return gate.refusal;
  const { data, error } = await supabase.from('credit_packs').delete().eq('id', packId).select('id');
  if (error) return businessWriteFailed(error, 'credit packs', 'Could not delete the pack');
  if (!data || data.length === 0) return fail(null, onlyAdminMessage('credit packs'));
}

// Grants a one-off pack as a 'bonus'-bucket credit through grant_credit_pack (migration 0133): the database reads the pack itself (so the
// numbers cannot be tampered with from the browser), checks it belongs to the member's gym, and sets the expiry. Returns rather than
// throws so the reason reaches the screen.
export async function grantCreditPack(clientId: string, packId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('grant_credit_pack', { p_client: clientId, p_pack: packId });
  return error ? fail(error, 'Could not give that pack') : ok();
}

// ---- Coach membership panel (migration 0088) ----

// Starts a plan for a member: today, or a later date when they have no active plan yet (the
// weekly credits arrive on the start date). `end` is the planned last day, e.g. a challenge's end.
export async function startMembership(clientId: string, packageId: string, start: string | null, end: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('start_membership', {
    p_client_id: clientId,
    p_package_id: packageId,
    p_start: start,
    p_end: end,
  });
  return error ? fail(error, 'Could not start that plan') : ok();
}

// End a plan now (weekly credits are cleared), or plan its last day.
export async function endMembership(membershipId: string, end: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('end_membership', { p_membership_id: membershipId, p_end: end });
  return error ? fail(error, 'Could not end that plan') : ok();
}

export async function clearScheduledEnd(membershipId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('clear_scheduled_end', { p_membership_id: membershipId });
  return error ? fail(error, 'Could not remove the end date') : ok();
}

// A member's plans, newest first, a page at a time. `hasMore` says whether there are older ones, so the screen never calls a cut-off
// list "all" (R27).
export async function getMembershipHistory(
  clientId: string,
  options: { offset?: number; limit?: number } = {}
): Promise<{ rows: ClientMembershipRow[]; hasMore: boolean }> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? 10;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_memberships')
    .select('*, package:membership_packages(*)')
    .eq('client_id', clientId)
    .order('started_at', { ascending: false })
    .order('id')
    .range(offset, offset + limit); // one more than asked for, to know if there is another page
  if (error) return { rows: [], hasMore: false };
  const rows = (data ?? []) as unknown as ClientMembershipRow[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// A member's credit ledger, newest first, a page at a time, optionally only the manual changes, the booking rows or the automatic ones
// (weekly resets and expiries dominate after a few months). `hasMore` says whether there are older rows.
export async function getCreditHistory(
  clientId: string,
  options: { offset?: number; limit?: number; filter?: CreditFilter } = {}
): Promise<{ rows: CreditsLedgerRow[]; hasMore: boolean }> {
  const offset = options.offset ?? 0;
  const limit = options.limit ?? HISTORY_PAGE;
  const filter = options.filter ?? 'all';
  const supabase = await createClient();
  let query = supabase.from('credits_ledger').select('*').eq('client_id', clientId);
  // The same three groups as creditKind() in lib/creditsForm.ts.
  if (filter === 'booking') query = query.not('booking_id', 'is', null);
  else if (filter === 'manual') query = query.is('booking_id', null).not('granted_by', 'is', null);
  else if (filter === 'automatic') query = query.is('booking_id', null).is('granted_by', null);
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .order('id')
    .range(offset, offset + limit); // one more than asked for, to know if there is another page
  if (error) return { rows: [], hasMore: false };
  const rows = (data ?? []) as CreditsLedgerRow[];
  return { rows: rows.slice(0, limit), hasMore: rows.length > limit };
}

// A member's own view of their credits (CC1): the last few ledger rows, and the bonus credits that will run out, with when. A small
// read; the full history is the coach's.
export async function getMyCreditHistory(
  clientId: string,
  limit = 10
): Promise<{ recent: CreditsLedgerRow[]; expiring: CreditsLedgerRow[] }> {
  const supabase = await createClient();
  const [recent, expiring] = await Promise.all([
    supabase.from('credits_ledger').select('*').eq('client_id', clientId).order('created_at', { ascending: false }).order('id').limit(limit),
    supabase
      .from('credits_ledger')
      .select('*')
      .eq('client_id', clientId)
      .eq('bucket', 'bonus')
      .gt('delta', 0)
      .is('expired_at', null)
      .gt('expires_at', new Date().toISOString())
      .order('expires_at')
      .limit(20),
  ]);
  return { recent: (recent.data ?? []) as CreditsLedgerRow[], expiring: (expiring.data ?? []) as CreditsLedgerRow[] };
}

// "Record an extra session": takes credits off with a note, from the weekly allowance first and then any bonus credits, never below
// what they have. Through remove_credits (migration 0133), which does the sums under a lock so two removals cannot both pass the balance
// check. Returns rather than throws so the reason reaches the screen ("They only have 2 credits.").
export async function removeCredits(clientId: string, amount: number, reason: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('remove_credits', { p_client: clientId, p_amount: amount, p_reason: reason.trim() });
  return error ? fail(error, 'Could not remove the credits') : ok();
}
