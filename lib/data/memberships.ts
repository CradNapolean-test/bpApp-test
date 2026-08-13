'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingCoachId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { ClientMembershipRow, MembershipPackageRow } from './types';

export async function getPackages(): Promise<MembershipPackageRow[]> {
  const supabase = await createClient();
  const coachId = await resolveScopingCoachId(supabase);
  const { data, error } = await supabase
    .from('membership_packages')
    .select('*')
    .eq('coach_id', coachId)
    .order('credits_per_week');
  if (error) raise(error);
  return data ?? [];
}

export async function createPackage(fields: Omit<MembershipPackageRow, 'id' | 'coach_id' | 'created_at'>): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('membership_packages').insert({ ...fields, coach_id: user.id });
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
