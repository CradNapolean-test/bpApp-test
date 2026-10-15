import { raise } from './errors';
import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays, todayIsoInTz, toIsoDate, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { computeHealth, type ClientHealthBucket } from '@/lib/healthStatus';
import { fetchAllPages } from '@/lib/paging';
import { LOGGED_DATA_FILTER } from '@/lib/utils/dailyLog';

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

// Same idea as resolveScopingCoachId, but for the gym-shared tables (classes,
// membership_packages, form_templates, program_templates, education_courses, client_groups,
// scheduled_communications) -- a coach's own gym_id, or their coach's gym_id if the caller is
// a client. Calls the my_scoping_gym_id() RPC (0052) rather than a plain embedded select --
// profiles' select policies don't cover "my own coach's row" for a client caller (the opposite
// direction from is_coach_of/owns_client), so a client-side embed would silently come back
// null under RLS. Mirrors get_my_coach_display_name's exact reasoning (0042).
export async function resolveScopingGymId(supabase: SupabaseClient): Promise<string> {
  const { data, error } = await supabase.rpc('my_scoping_gym_id');
  if (error) raise(error);
  return data as string;
}

export interface CoachClientRow {
  id: string;
  email: string;
  name: string | null;
  start_weight: number | null;
  goal_weight: number | null;
  balance: number;
  // New member whose starting plan hasn't been checked yet (onboarding).
  needsReview: boolean;
  // Name of their current membership plan, null when none is set up.
  planName: string | null;
}

// What a plan is called when the member HAS one but its row cannot be read (it belongs to another gym than the coach's active one and no
// rule lets the coach see it). Showing "No plan" for them was wrong: 63 members with a plan all read "No plan" (R38).
export const PLAN_NAME_UNREADABLE = 'Plan';

// The name of the plan on a member's open (not ended) membership; null only when they have none.
export function planNameOf(memberships: unknown): string | null {
  const rows = (Array.isArray(memberships) ? memberships : []) as { ended_at: string | null; membership_packages: { name: string } | { name: string }[] | null }[];
  const open = rows.find((m) => m.ended_at === null);
  if (!open) return null;
  const pkg = Array.isArray(open.membership_packages) ? open.membership_packages[0] : open.membership_packages;
  return pkg?.name ?? PLAN_NAME_UNREADABLE;
}

export interface GymClientRow extends CoachClientRow {
  coachId: string;
  coachName: string;
  isOwnClient: boolean;
}

// Every row of the client list queries below, in pages: the database stops at 1,000 rows without saying so (CM6).
const CLIENT_ROW_SELECT =
  'id, email, client_profiles(name, start_weight, goal_weight, needs_coach_review), credits_balance(balance), client_memberships!client_id(ended_at, membership_packages(name))';

// Every client at the gym, regardless of which coach they're assigned to -- read-only
// cross-coach search (see is_same_gym_as_client RLS, 0052/0053). Filters on the client's own
// fixed gym_id (0056), not their coach's currently-active gym -- a dual-gym coach's clients
// stay put in their home gym's search results even after that coach switches gyms. Renders
// through the same ClientTable component as getMyClients; the coachName/isOwnClient fields let
// the UI attribute each row and gate mutating actions to the client's actual assigned coach.
export async function searchGymClients(
  supabase: SupabaseClient,
  gymId: string,
  myCoachId: string
): Promise<GymClientRow[]> {
  const { rows, error } = await fetchAllPages((from, to) =>
    supabase
      .from('profiles')
      .select(`${CLIENT_ROW_SELECT}, coach:coach_id(id, email, display_name)`)
      .eq('role', 'client')
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
  if (error) raise(error);

  return rows.map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const balanceRow = Array.isArray(row.credits_balance) ? row.credits_balance[0] : row.credits_balance;
    const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
    return {
      id: row.id,
      email: row.email,
      name: profile?.name ?? null,
      start_weight: profile?.start_weight ?? null,
      goal_weight: profile?.goal_weight ?? null,
      balance: balanceRow?.balance ?? 0,
      needsReview: profile?.needs_coach_review ?? false,
      planName: planNameOf(row.client_memberships),
      coachId: coach?.id ?? '',
      coachName: coach?.display_name ?? coach?.email ?? 'Unknown coach',
      isOwnClient: coach?.id === myCoachId,
    };
  });
}

// The coach's own members, whichever gym they belong to (the page says so when that is not the gym being viewed).
export async function getMyClients(
  supabase: SupabaseClient,
  coachId: string
): Promise<CoachClientRow[]> {
  const { rows, error } = await fetchAllPages((from, to) =>
    supabase
      .from('profiles')
      .select(CLIENT_ROW_SELECT)
      .eq('coach_id', coachId)
      .eq('role', 'client')
      .order('created_at', { ascending: false })
      .order('id')
      .range(from, to)
  );
  if (error) raise(error);

  return rows.map((row) => {
    const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
    const balanceRow = Array.isArray(row.credits_balance) ? row.credits_balance[0] : row.credits_balance;
    return {
      id: row.id,
      email: row.email,
      name: profile?.name ?? null,
      start_weight: profile?.start_weight ?? null,
      goal_weight: profile?.goal_weight ?? null,
      balance: balanceRow?.balance ?? 0,
      needsReview: profile?.needs_coach_review ?? false,
      planName: planNameOf(row.client_memberships),
    };
  });
}

export type { ClientHealthBucket };

export interface ClientHealthStatus {
  clientId: string;
  name: string;
  daysSinceActive: number;
  status: ClientHealthBucket;
  lastActiveDate: string | null;
}

// What the status of one member is made from: a row of profiles with their client_profiles.
type HealthProfile = { name: string | null; checkin_reminder_days: number | null; timezone: string | null };
interface HealthRow {
  id: string;
  email: string;
  created_at: string;
  client_profiles: HealthProfile | HealthProfile[] | null;
}

function statusOfRow(row: HealthRow, lastActive: string | null): ClientHealthStatus {
  const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
  // Each client's own local "today", not one shared UTC value for the whole roster -- same root-cause fix as loadDashboardBundle
  // (see migration 0044).
  const health = computeHealth({
    reminderDays: profile?.checkin_reminder_days,
    lastActive,
    createdAt: row.created_at,
    todayIso: todayIsoInTz(profile?.timezone ?? DEFAULT_TIMEZONE),
  });
  return { clientId: row.id, name: profile?.name ?? row.email, daysSinceActive: health.daysSinceActive, status: health.status, lastActiveDate: lastActive };
}

// The same thing for a member whose rows the page already has (the member's own page): no extra query for the profile.
export function memberHealthStatus(input: {
  clientId: string;
  name: string;
  createdAt: string;
  reminderDays: number | null | undefined;
  timezone: string | null | undefined;
  lastActive: string | null;
}): ClientHealthStatus {
  return statusOfRow(
    {
      id: input.clientId,
      email: input.name,
      created_at: input.createdAt,
      client_profiles: { name: input.name, checkin_reminder_days: input.reminderDays ?? null, timezone: input.timezone ?? null },
    },
    input.lastActive
  );
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Program Health widget: how many days since each client's last *real* logged day
// (get_client_last_active, 0010_client_last_active.sql -- excludes the auto-created blank
// "today" row), relative to that client's own coach-configured checkin_reminder_days
// threshold (already surfaced in CreditsTab.tsx). Reuses the same inactivity signal the
// check-in reminder automation computes, rather than a second definition of "at risk".
//
// scope: a coach id (that coach's own members, the old behaviour), or { coachId, gymId }: the coach's own members AND everyone at that
// gym, so a colleague's member in "Whole gym" gets a real status instead of "Unmonitored" (R32). One query for the members, one for the
// last-active dates of everyone the caller can see; nothing is fetched per member.
export async function getClientHealthStatuses(
  supabase: SupabaseClient,
  scope: string | { coachId?: string; gymId?: string }
): Promise<ClientHealthStatus[]> {
  const { coachId, gymId } = typeof scope === 'string' ? { coachId: scope, gymId: undefined } : scope;
  const filters = [coachId && UUID.test(coachId) ? `coach_id.eq.${coachId}` : null, gymId && UUID.test(gymId) ? `gym_id.eq.${gymId}` : null].filter(Boolean);
  if (filters.length === 0) return [];

  const { rows: clients, error: clientsError } = await fetchAllPages((from, to) =>
    supabase
      .from('profiles')
      .select('id, email, created_at, client_profiles(name, checkin_reminder_days, timezone)')
      .eq('role', 'client')
      .or(filters.join(','))
      .order('id')
      .range(from, to)
  );
  if (clientsError) raise(clientsError);
  if (clients.length === 0) return [];

  const { rows: lastActiveRows, error: lastActiveError } = await fetchAllPages((from, to) =>
    supabase.rpc('get_client_last_active').order('client_id').range(from, to)
  );
  if (lastActiveError) raise(lastActiveError);
  const lastActiveMap = new Map((lastActiveRows as { client_id: string; last_active: string }[]).map((r) => [r.client_id, r.last_active]));

  return (clients as unknown as HealthRow[]).map((row) => statusOfRow(row, lastActiveMap.get(row.id) ?? null));
}

// The last day a member logged anything (the same rule as get_client_last_active), for their own page: one narrow query for one member
// instead of the roster's.
export async function getClientLastActive(supabase: SupabaseClient, clientId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('client_id', clientId)
    .or(LOGGED_DATA_FILTER)
    .order('log_date', { ascending: false })
    .limit(1);
  if (error) raise(error);
  return (data?.[0]?.log_date as string | undefined) ?? null;
}

// The member's most recent weigh-in, however long ago. The member page's weight card is drawn from the last 84 days of logs, so a member
// who last weighed in three months ago read "No weigh-ins" (MO).
export async function getLatestWeighIn(supabase: SupabaseClient, clientId: string): Promise<{ date: string; weight: number } | null> {
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date, bodyweight')
    .eq('client_id', clientId)
    .not('bodyweight', 'is', null)
    .order('log_date', { ascending: false })
    .limit(1);
  if (error) raise(error);
  const row = data?.[0];
  return row && row.bodyweight != null ? { date: row.log_date as string, weight: Number(row.bodyweight) } : null;
}

// The name of the coach a member belongs to, for the "you are viewing another coach's member" note.
export async function getCoachDisplayName(supabase: SupabaseClient, coachId: string | null): Promise<string | null> {
  if (!coachId) return null;
  const { data } = await supabase.from('profiles').select('display_name, email').eq('id', coachId).maybeSingle();
  return (data?.display_name as string | null | undefined) || (data?.email as string | null | undefined) || null;
}

// ---- unread messages, for the header badge ----

// The coach's total unread messages: one count (coach_unread_total, migration 0141) instead of building the whole inbox overview to add
// it up. Falls back to the overview when 0141 is not applied yet, so the pages still load.
export async function getCoachUnreadTotal(supabase: SupabaseClient): Promise<number> {
  const { data, error } = await supabase.rpc('coach_unread_total');
  if (!error) return Number(data ?? 0);
  const { data: rows, error: overviewError } = await supabase.rpc('get_coach_chat_overview');
  if (overviewError) return 0;
  return ((rows ?? []) as { unread_count: number | string }[]).reduce((sum, r) => sum + Number(r.unread_count), 0);
}

// Unread messages from one member to the coach: the thread's read marker, then one count.
export async function getCoachUnreadForClient(supabase: SupabaseClient, clientId: string): Promise<number> {
  const { data: thread } = await supabase.from('chat_threads').select('coach_last_read_at').eq('client_id', clientId).maybeSingle();
  const since = (thread?.coach_last_read_at as string | null | undefined) ?? '1970-01-01T00:00:00Z';
  const { count } = await supabase
    .from('chat_messages')
    .select('id', { count: 'exact', head: true })
    .eq('client_id', clientId)
    .eq('sender_id', clientId)
    .gt('created_at', since);
  return count ?? 0;
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
