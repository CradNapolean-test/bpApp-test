'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import type { ClientGroupWithMembers } from './types';

export async function getGroups(): Promise<ClientGroupWithMembers[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);

  const { data, error } = await supabase
    .from('client_groups')
    .select('*, client_group_members(client_id)')
    .eq('gym_id', gymId)
    .order('created_at');
  if (error) raise(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    coach_id: row.coach_id,
    gym_id: row.gym_id,
    name: row.name,
    created_at: row.created_at,
    memberIds: (row.client_group_members as { client_id: string }[]).map((m) => m.client_id),
  }));
}

// expectedGymId: the gym the page was drawn for; see lib/data/gymGuard.ts (R28).
export async function createGroup(name: string, expectedGymId?: string | null): Promise<void | ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');
  const gymId = await resolveScopingGymId(supabase);

  const { error } = await supabase.from('client_groups').insert({ coach_id: user.id, gym_id: gymId, name });
  if (error) raise(error);
}

// Deleting a group cancels its pending and repeating broadcasts and keeps the group's name on the ones already sent (migration 0133).
// Returns rather than throws so a refusal reaches the screen as words.
export async function deleteGroup(groupId: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.from('client_groups').delete().eq('id', groupId);
  return error ? fail(error, 'Could not delete that group') : ok();
}

// Adds or removes many members in one request (the member picker's "select all").
export async function addClientsToGroup(groupId: string, clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_group_members')
    .upsert(clientIds.map((client_id) => ({ group_id: groupId, client_id })), { onConflict: 'group_id,client_id', ignoreDuplicates: true });
  if (error) raise(error);
}

export async function removeClientsFromGroup(groupId: string, clientIds: string[]): Promise<void> {
  if (clientIds.length === 0) return;
  const supabase = await createClient();
  const { error } = await supabase.from('client_group_members').delete().eq('group_id', groupId).in('client_id', clientIds);
  if (error) raise(error);
}

export async function addClientToGroup(groupId: string, clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('client_group_members').insert({ group_id: groupId, client_id: clientId });
  if (error) raise(error);
}

export async function removeClientFromGroup(groupId: string, clientId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('client_group_members')
    .delete()
    .eq('group_id', groupId)
    .eq('client_id', clientId);
  if (error) raise(error);
}
