import { raise } from './errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { daysBetween, toIsoDate } from '@/lib/utils/dates';

// The "coach-global" tables (classes, membership_packages, form_templates) are scoped to a
// specific coach, but the caller could be that coach themself or one of their clients --
// this resolves which coach_id to filter by either way, so callers don't have to know which
// role they're running as.
export async function resolveScopingCoachId(supabase: SupabaseClient): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role, coach_id')
    .eq('id', user.id)
    .single();
  if (error) raise(error);

  return profile.role === 'coach' ? user.id : (profile.coach_id as string);
}

export interface CoachClientRow {
  id: string;
  email: string;
  name: string | null;
  start_weight: number | null;
  goal_weight: number | null;
  balance: number;
}

export async function getMyClients(
  supabase: SupabaseClient,
  coachId: string
): Promise<CoachClientRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, client_profiles(name, start_weight, goal_weight), credits_balance(balance)'
    )
    .eq('coach_id', coachId)
    .eq('role', 'client')
    .order('created_at', { ascending: false });

  if (error) raise(error);

  return (data ?? []).map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const balanceRow = Array.isArray(row.credits_balance) ? row.credits_balance[0] : row.credits_balance;
    return {
      id: row.id,
      email: row.email,
      name: profile?.name ?? null,
      start_weight: profile?.start_weight ?? null,
      goal_weight: profile?.goal_weight ?? null,
      balance: balanceRow?.balance ?? 0,
    };
  });
}

export type ClientHealthBucket = 'green' | 'amber' | 'red' | 'unmonitored';

export interface ClientHealthStatus {
  clientId: string;
  name: string;
  daysSinceActive: number;
  status: ClientHealthBucket;
  lastActiveDate: string | null;
}

// Program Health widget: how many days since each client's last *real* logged day
// (get_client_last_active, 0010_client_last_active.sql -- excludes the auto-created blank
// "today" row), relative to that client's own coach-configured checkin_reminder_days
// threshold (already surfaced in CreditsTab.tsx). Reuses the same inactivity signal the
// check-in reminder automation computes, rather than a second definition of "at risk".
export async function getClientHealthStatuses(
  supabase: SupabaseClient,
  coachId: string
): Promise<ClientHealthStatus[]> {
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, email, created_at, client_profiles(name, checkin_reminder_days)')
    .eq('coach_id', coachId)
    .eq('role', 'client');
  if (clientsError) raise(clientsError);
  if (!clients || clients.length === 0) return [];

  const { data: lastActiveRows, error: lastActiveError } = await supabase.rpc('get_client_last_active');
  if (lastActiveError) raise(lastActiveError);
  const lastActiveMap = new Map(
    ((lastActiveRows ?? []) as { client_id: string; last_active: string }[]).map((r) => [r.client_id, r.last_active])
  );

  const todayIso = toIsoDate(new Date());

  return clients.map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const threshold = profile?.checkin_reminder_days ?? 3;
    const lastActive = lastActiveMap.get(row.id) ?? null;
    const daysSinceActive = daysBetween(lastActive ?? (row.created_at as string).slice(0, 10), todayIso);

    let status: ClientHealthBucket;
    if (threshold === 0) status = 'unmonitored';
    else if (daysSinceActive <= threshold) status = 'green';
    else if (daysSinceActive <= threshold * 2) status = 'amber';
    else status = 'red';

    return {
      clientId: row.id,
      name: profile?.name ?? row.email,
      daysSinceActive,
      status,
      lastActiveDate: lastActive,
    };
  });
}
