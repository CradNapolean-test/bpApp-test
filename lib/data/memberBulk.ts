'use server';

// The Members list's select mode (CL18): the same message into each chosen member's own chat, and adding the chosen members to a group.
// Each works only on the caller's own members (profiles.coach_id is them): the screen offers nobody else, and anyone else in the list is
// reported back as not done rather than tried. The database's rules still decide every write (chat_messages only takes a message into a
// thread the sender owns, client_group_members only a group at the coach's active gym); nothing here reaches past them.
// Results are returned, not thrown, so the screen can say who it failed for (Next.js hides a thrown message in production).

import { createClient } from '@/lib/supabase/server';
import { sendMessage } from './chat';
import { addClientsToGroup } from './clientGroups';
import { resolveScopingGymId } from './coach';
import { checkActiveGym } from './gymGuard';
import { friendlyMessage } from './errors';
import { BULK_MESSAGE_MAX, BULK_SEND_BATCH, GROUP_NAME_MAX, sameGroupName, type BatchResult, type BulkFailure } from '@/lib/memberList';
import type { SupabaseClient } from '@supabase/supabase-js';

export type MessageEachResult = BatchResult;

export type AddToGroupResult =
  | { ok: true; groupId: string; groupName: string; added: string[]; already: string[]; failed: BulkFailure[] }
  | { ok: false; error: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_YOURS = 'Not one of your members';

function messageOf(err: unknown, fallback: string): string {
  const m = err instanceof Error ? err.message : err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string' ? (err as { message: string }).message : '';
  return m.trim() ? friendlyMessage(m.trim()) : fallback;
}

// The ids, each once and well formed, split into the caller's own members and the rest.
async function ownMembers(supabase: SupabaseClient, userId: string, clientIds: readonly string[]): Promise<{ own: string[]; others: string[] } | { error: string }> {
  const ids = [...new Set(clientIds)].filter((id) => UUID.test(id));
  if (ids.length === 0) return { own: [], others: [] };
  const { data, error } = await supabase.from('profiles').select('id').in('id', ids).eq('role', 'client').eq('coach_id', userId);
  if (error) return { error: messageOf(error, 'Could not check who your members are') };
  const own = new Set((data ?? []).map((r) => r.id as string));
  return { own: ids.filter((id) => own.has(id)), others: ids.filter((id) => !own.has(id)) };
}

// One batch (BULK_SEND_BATCH at most): the screen sends a long list a batch at a time and shows how far it has got. Each message goes the
// same way as one typed into that member's chat (sendMessage), so it is from the coach, in the member's own thread, and pings their phone.
export async function messageEach(clientIds: string[], text: string): Promise<MessageEachResult> {
  const body = text.trim();
  if (!body) return { ok: false, error: 'Write a message first.' };
  if (body.length > BULK_MESSAGE_MAX) return { ok: false, error: `That message is too long (${BULK_MESSAGE_MAX.toLocaleString('en-GB')} characters at most).` };
  if (clientIds.length > BULK_SEND_BATCH) return { ok: false, error: `Send to ${BULK_SEND_BATCH} members at a time.` };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Sign in again and try once more.' };
  const who = await ownMembers(supabase, user.id, clientIds);
  if ('error' in who) return { ok: false, error: who.error };

  const sent: string[] = [];
  const failed: BulkFailure[] = who.others.map((clientId) => ({ clientId, error: NOT_YOURS }));
  // One at a time, in the order given: a member's thread gets exactly one copy, and a failure for one member never stops the rest.
  for (const clientId of who.own) {
    try {
      await sendMessage(clientId, body);
      sent.push(clientId);
    } catch (err) {
      failed.push({ clientId, error: messageOf(err, 'Could not send') });
    }
  }
  return { ok: true, sent, failed };
}

async function addOwnMembers(
  supabase: SupabaseClient,
  userId: string,
  group: { id: string; name: string },
  clientIds: readonly string[]
): Promise<AddToGroupResult> {
  const who = await ownMembers(supabase, userId, clientIds);
  if ('error' in who) return { ok: false, error: who.error };
  const failed: BulkFailure[] = who.others.map((clientId) => ({ clientId, error: NOT_YOURS }));
  if (who.own.length === 0) return { ok: true, groupId: group.id, groupName: group.name, added: [], already: [], failed };

  const { data: existing, error: readError } = await supabase.from('client_group_members').select('client_id').eq('group_id', group.id).in('client_id', who.own);
  if (readError) return { ok: false, error: messageOf(readError, 'Could not read the group') };
  const inGroup = new Set((existing ?? []).map((r) => r.client_id as string));
  const toAdd = who.own.filter((id) => !inGroup.has(id));
  const already = who.own.filter((id) => inGroup.has(id));
  if (toAdd.length === 0) return { ok: true, groupId: group.id, groupName: group.name, added: [], already, failed };
  try {
    // One write for all of them (the same call as Manage groups' "Select all"): it adds every one or none.
    await addClientsToGroup(group.id, toAdd);
    return { ok: true, groupId: group.id, groupName: group.name, added: toAdd, already, failed };
  } catch (err) {
    const reason = messageOf(err, 'Could not add them');
    return { ok: true, groupId: group.id, groupName: group.name, added: [], already, failed: [...failed, ...toAdd.map((clientId) => ({ clientId, error: reason }))] };
  }
}

// An existing group at the coach's active gym. `expectedGymId`: the gym the page was drawn for (lib/data/gymGuard.ts, R28).
export async function addMembersToGroup(groupId: string, clientIds: string[], expectedGymId?: string | null): Promise<AddToGroupResult> {
  if (!UUID.test(groupId)) return { ok: false, error: 'Choose a group.' };
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale && !stale.ok) return stale;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Sign in again and try once more.' };
  // Only a group this coach can see, which is one at their active gym (client_groups' rule).
  const { data: group, error } = await supabase.from('client_groups').select('id, name').eq('id', groupId).maybeSingle();
  if (error) return { ok: false, error: messageOf(error, 'Could not read the group') };
  if (!group) return { ok: false, error: 'That group is not there any more. Reload the page.' };
  return addOwnMembers(supabase, user.id, { id: group.id as string, name: group.name as string }, clientIds);
}

// A new group at the coach's active gym (as Manage groups makes one), then the members added to it. If a group of that name is already
// there, they go into that one instead of a second group with the same name.
export async function addMembersToNewGroup(name: string, clientIds: string[], expectedGymId?: string | null): Promise<AddToGroupResult> {
  const groupName = name.trim();
  if (!groupName) return { ok: false, error: 'Give the group a name.' };
  if (groupName.length > GROUP_NAME_MAX) return { ok: false, error: `Group names can be ${GROUP_NAME_MAX} characters at most.` };
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale && !stale.ok) return stale;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'You are signed out. Sign in again and try once more.' };
  const gymId = await resolveScopingGymId(supabase).catch(() => null);
  if (!gymId) return { ok: false, error: 'Could not tell which gym you are in. Reload the page.' };

  // A gym has a handful of groups: read their names and compare here, rather than build a pattern out of what the coach typed.
  const { data: groups, error: readError } = await supabase.from('client_groups').select('id, name').eq('gym_id', gymId);
  if (readError) return { ok: false, error: messageOf(readError, 'Could not read the groups') };
  const match = (groups ?? []).find((g) => sameGroupName(g.name as string, groupName));
  if (match) return addOwnMembers(supabase, user.id, { id: match.id as string, name: match.name as string }, clientIds);

  const { data: created, error } = await supabase.from('client_groups').insert({ coach_id: user.id, gym_id: gymId, name: groupName }).select('id, name').single();
  if (error || !created) return { ok: false, error: messageOf(error, 'Could not make the group') };
  return addOwnMembers(supabase, user.id, { id: created.id as string, name: created.name as string }, clientIds);
}
