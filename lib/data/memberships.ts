'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { ClientMembershipRow, CreditPackRow, CreditsLedgerRow, MembershipPackageRow } from './types';

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

export async function createPackage(
  fields: Omit<MembershipPackageRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase.from('membership_packages').insert({ ...fields, coach_id: user.id, gym_id: gymId });
  if (error) raise(error);
}

export async function updatePackage(
  packageId: string,
  fields: Partial<Omit<MembershipPackageRow, 'id' | 'coach_id' | 'created_at'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('membership_packages').update(fields).eq('id', packageId);
  if (error) raise(error);
}

export async function deletePackage(packageId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('membership_packages').delete().eq('id', packageId);
  if (error) raise(error);
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
  fields: Omit<CreditPackRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase.from('credit_packs').insert({ ...fields, coach_id: user.id, gym_id: gymId });
  if (error) raise(error);
}

export async function updateCreditPack(
  packId: string,
  fields: Partial<Omit<CreditPackRow, 'id' | 'coach_id' | 'gym_id' | 'created_at'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('credit_packs').update(fields).eq('id', packId);
  if (error) raise(error);
}

export async function deleteCreditPack(packId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('credit_packs').delete().eq('id', packId);
  if (error) raise(error);
}

// Grants a one-off pack as a 'bonus'-bucket credit: never resets, expires
// expires_after_days from now if the pack has one set. A plain table insert (same RLS path
// as grantCredits) rather than an RPC -- the pack's own fields, already fetched by the
// caller, are all that's needed to compute the ledger row.
export async function grantCreditPack(clientId: string, pack: CreditPackRow): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const expiresAt = pack.expires_after_days
    ? new Date(Date.now() + pack.expires_after_days * 86400000).toISOString()
    : null;

  const { error } = await supabase.from('credits_ledger').insert({
    client_id: clientId,
    delta: pack.credits,
    reason: `Pack: ${pack.name}`,
    granted_by: user.id,
    expires_at: expiresAt,
    pack_id: pack.id,
  });
  if (error) raise(error);
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

export async function getMembershipHistory(clientId: string): Promise<ClientMembershipRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('client_memberships')
    .select('*, package:membership_packages(*)')
    .eq('client_id', clientId)
    .order('started_at', { ascending: false })
    .limit(10);
  if (error) return [];
  return (data ?? []) as unknown as ClientMembershipRow[];
}

export async function getCreditHistory(clientId: string, limit = 12): Promise<CreditsLedgerRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('credits_ledger')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) return [];
  return (data ?? []) as CreditsLedgerRow[];
}

// "Record an extra session": takes credits off with a note, from the weekly allowance first and
// then any bonus credits, never below what they have.
export async function removeCredits(clientId: string, amount: number, reason: string): Promise<ActionResult> {
  if (!Number.isInteger(amount) || amount < 1 || amount > 50) return fail(null, 'Enter a whole number of credits');
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail(null, 'Not signed in');

  const { data: rows, error: balError } = await supabase
    .from('credits_balance_by_bucket')
    .select('bucket, balance')
    .eq('client_id', clientId);
  if (balError) return fail(balError, 'Could not read their credits');
  const balance: Record<string, number> = { membership: 0, bonus: 0 };
  for (const r of rows ?? []) balance[r.bucket as string] = r.balance;
  if (balance.membership + balance.bonus < amount) return fail(null, `They only have ${balance.membership + balance.bonus} credits`);

  const fromMembership = Math.min(amount, Math.max(balance.membership, 0));
  const fromBonus = amount - fromMembership;
  const note = reason.trim() || 'Removed by coach';
  const entries = [
    fromMembership > 0 && { bucket: 'membership', delta: -fromMembership },
    fromBonus > 0 && { bucket: 'bonus', delta: -fromBonus },
  ].filter(Boolean) as { bucket: string; delta: number }[];
  const { error } = await supabase
    .from('credits_ledger')
    .insert(entries.map((e) => ({ client_id: clientId, delta: e.delta, bucket: e.bucket, reason: `Removed: ${note}`, granted_by: user.id })));
  return error ? fail(error, 'Could not remove the credits') : ok();
}
