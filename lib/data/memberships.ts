'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { ClientMembershipRow, CreditPackRow, MembershipPackageRow } from './types';

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
