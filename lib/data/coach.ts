import { raise } from './errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, daysBetween, todayIsoInTz, toIsoDate, DEFAULT_TIMEZONE } from '@/lib/utils/dates';

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
  deletion_requested_at: string | null;
}

export async function getMyClients(
  supabase: SupabaseClient,
  coachId: string
): Promise<CoachClientRow[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(
      'id, email, client_profiles(name, start_weight, goal_weight, deletion_requested_at), credits_balance(balance)'
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
      deletion_requested_at: profile?.deletion_requested_at ?? null,
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
    .select('id, email, created_at, client_profiles(name, checkin_reminder_days, timezone)')
    .eq('coach_id', coachId)
    .eq('role', 'client');
  if (clientsError) raise(clientsError);
  if (!clients || clients.length === 0) return [];

  const { data: lastActiveRows, error: lastActiveError } = await supabase.rpc('get_client_last_active');
  if (lastActiveError) raise(lastActiveError);
  const lastActiveMap = new Map(
    ((lastActiveRows ?? []) as { client_id: string; last_active: string }[]).map((r) => [r.client_id, r.last_active])
  );

  return clients.map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const threshold = profile?.checkin_reminder_days ?? 3;
    const lastActive = lastActiveMap.get(row.id) ?? null;
    // Each client's own local "today", not one shared UTC value for the whole roster --
    // same root-cause fix as loadDashboardBundle (see migration 0044).
    const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
    // Clamped at 0 as defense-in-depth -- shouldn't go negative anymore now "today" is
    // computed per-client, but a display value should never read as nonsensical regardless.
    const daysSinceActive = Math.max(0, daysBetween(lastActive ?? (row.created_at as string).slice(0, 10), todayIso));

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

export interface ClientHabitAdherence {
  clientId: string;
  name: string;
  totalHabits: number;
  completedToday: number;
}

// Roster-wide "who's on track with their habits today" -- reuses getClientHealthStatuses'
// exact aggregation shape (fetch every client the coach owns, join their own data, compute a
// per-client summary), just for habits/habit_logs instead of last-active. Only clients with at
// least one habit assigned are included -- a client with none isn't "0/0 done", they're just
// not using this feature.
export async function getRosterHabitAdherence(
  supabase: SupabaseClient,
  coachId: string
): Promise<ClientHabitAdherence[]> {
  const { data: clients, error: clientsError } = await supabase
    .from('profiles')
    .select('id, email, client_profiles(name, timezone)')
    .eq('coach_id', coachId)
    .eq('role', 'client');
  if (clientsError) raise(clientsError);
  if (!clients || clients.length === 0) return [];

  const clientIds = clients.map((c) => c.id);
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('id, client_id')
    .in('client_id', clientIds);
  if (habitsError) raise(habitsError);
  if (!habits || habits.length === 0) return [];

  const habitIds = habits.map((h) => h.id);
  // A wide-enough window (yesterday UTC onward) to cover "today" in every real-world
  // timezone, not just UTC -- narrowed to each client's own exact local today below.
  const windowStart = toIsoDate(addDays(new Date(), -1));
  const { data: logs, error: logsError } = await supabase
    .from('habit_logs')
    .select('habit_id, log_date, completed')
    .in('habit_id', habitIds)
    .eq('completed', true)
    .gte('log_date', windowStart);
  if (logsError) raise(logsError);

  const habitsByClient = new Map<string, string[]>();
  for (const h of habits) {
    const list = habitsByClient.get(h.client_id) ?? [];
    list.push(h.id);
    habitsByClient.set(h.client_id, list);
  }
  const completedHabitIdsByDate = new Map<string, Set<string>>();
  for (const l of logs ?? []) {
    const set = completedHabitIdsByDate.get(l.log_date) ?? new Set<string>();
    set.add(l.habit_id);
    completedHabitIdsByDate.set(l.log_date, set);
  }

  return clients
    .map((row) => {
      const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
      const clientHabitIds = habitsByClient.get(row.id) ?? [];
      if (clientHabitIds.length === 0) return null;
      const todayIso = todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE);
      const completedToday = completedHabitIdsByDate.get(todayIso) ?? new Set<string>();
      return {
        clientId: row.id,
        name: profile?.name ?? row.email,
        totalHabits: clientHabitIds.length,
        completedToday: clientHabitIds.filter((id) => completedToday.has(id)).length,
      };
    })
    .filter((row): row is ClientHabitAdherence => row !== null);
}
