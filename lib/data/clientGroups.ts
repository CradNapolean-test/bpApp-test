'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ClientGroupWithMembers } from './types';

export async function getGroups(): Promise<ClientGroupWithMembers[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data, error } = await supabase
    .from('client_groups')
    .select('*, client_group_members(client_id)')
    .eq('coach_id', user.id)
    .order('created_at');
  if (error) raise(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    coach_id: row.coach_id,
    name: row.name,
    created_at: row.created_at,
    memberIds: (row.client_group_members as { client_id: string }[]).map((m) => m.client_id),
  }));
}

export async function createGroup(name: string): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { error } = await supabase.from('client_groups').insert({ coach_id: user.id, name });
  if (error) raise(error);
}

export async function deleteGroup(groupId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('client_groups').delete().eq('id', groupId);
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
