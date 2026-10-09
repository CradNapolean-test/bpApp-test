'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';
import type { RewardOverview, RewardRow, RewardsForMember } from './types';

const MISSING = ['42P01', 'PGRST205', 'PGRST202'];

// A member's rewards plus their progress. Tolerates migration 0068 not being applied yet, since
// this loads with every dashboard render.
export async function getRewardsForMember(clientId: string): Promise<RewardsForMember> {
  const empty: RewardsForMember = { rewards: [], grantedIds: [], sessions: 0, months: 0 };
  const supabase = await createClient();

  const { data: rewards, error } = await supabase.from('rewards').select('*').order('threshold');
  if (error) {
    if (MISSING.includes(error.code ?? '')) return empty;
    raise(error);
  }

  const [{ data: grants }, { data: progress }] = await Promise.all([
    supabase.from('reward_grants').select('reward_id').eq('client_id', clientId),
    supabase.rpc('member_reward_progress'),
  ]);
  const mine = (progress ?? []).find((p: { client_id: string }) => p.client_id === clientId);

  return {
    rewards: (rewards ?? []) as RewardRow[],
    grantedIds: (grants ?? []).map((g) => g.reward_id),
    sessions: Number(mine?.sessions ?? 0),
    months: Number(mine?.months ?? 0),
  };
}

// ---- coach side ----

export async function getRewardOverview(): Promise<RewardOverview[]> {
  const supabase = await createClient();
  const { data: rewards, error } = await supabase.from('rewards').select('*').order('threshold');
  if (error) {
    if (MISSING.includes(error.code ?? '')) return [];
    raise(error);
  }
  if (!rewards || rewards.length === 0) return [];

  const [{ data: grants }, { data: progress }] = await Promise.all([
    supabase.from('reward_grants').select('reward_id, client_id, granted_at'),
    supabase.rpc('member_reward_progress'),
  ]);
  const ids = [...new Set([...(progress ?? []).map((p: { client_id: string }) => p.client_id), ...(grants ?? []).map((g) => g.client_id as string)])];
  const { data: profiles } = ids.length
    ? await supabase.from('client_profiles').select('client_id, name').in('client_id', ids)
    : { data: [] as { client_id: string; name: string | null }[] };
  const nameBy = new Map((profiles ?? []).map((p) => [p.client_id, p.name ?? 'Member']));

  return (rewards as RewardRow[]).map((r) => {
    const granted = new Set((grants ?? []).filter((g) => g.reward_id === r.id).map((g) => g.client_id));
    const eligible = (progress ?? [])
      .filter((p: { client_id: string; sessions: number; months: number }) =>
        (r.kind === 'sessions' ? Number(p.sessions) : Number(p.months)) >= r.threshold && !granted.has(p.client_id)
      )
      .map((p: { client_id: string }) => ({ clientId: p.client_id, name: nameBy.get(p.client_id) ?? 'Member' }));
    const given = (grants ?? [])
      .filter((g) => g.reward_id === r.id)
      .map((g) => ({ clientId: g.client_id as string, name: nameBy.get(g.client_id) ?? 'Member', grantedAt: g.granted_at as string }))
      .sort((a, b) => b.grantedAt.localeCompare(a.grantedAt));
    return { ...r, grantedCount: granted.size, eligible, given };
  });
}

export async function createReward(fields: {
  name: string;
  description: string | null;
  kind: 'sessions' | 'months';
  threshold: number;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: gymId, error: gymError } = await supabase.rpc('my_gym_id');
  if (gymError || !gymId) return fail(gymError, 'Could not work out your gym');
  const { error } = await supabase.from('rewards').insert({ ...fields, gym_id: gymId });
  if (error) return fail(error, 'Could not create the reward');
  return ok();
}

export async function deleteReward(rewardId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('rewards').delete().eq('id', rewardId);
  if (error) return fail(error, 'Could not delete the reward');
  return ok();
}

export async function unmarkRewardGiven(rewardId: string, clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('reward_grants').delete().eq('reward_id', rewardId).eq('client_id', clientId);
  if (error) return fail(error, 'Could not undo that');
  return ok();
}

export async function markRewardGiven(rewardId: string, clientId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('reward_grants').insert({ reward_id: rewardId, client_id: clientId });
  if (error) return fail(error, 'Could not mark it as given');
  return ok();
}
