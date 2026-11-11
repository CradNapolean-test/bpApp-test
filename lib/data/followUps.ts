import type { SupabaseClient } from '@supabase/supabase-js';
import { raise } from './errors';
import { fetchAllPages } from '@/lib/paging';
import { LOGGED_DATA_FILTER } from '@/lib/utils/dailyLog';
import { addDays, toIsoDate } from '@/lib/utils/dates';
import { FOLLOW_UP_WINDOW_DAYS, followUpFor, type FollowUp } from '@/lib/followUp';

// What the follow-up list (lib/followUp.ts) is built from, read the same way by the coach dashboard (lib/data/coachDashboard.ts, inside
// its one members query) and the Clients page (getFollowUps below), so "Members to check in on · 7" on the dashboard is the same 7 as
// "Check in on · 7" on Clients (CL16). Both read: logged days and bookings from FOLLOW_UP_WINDOW_DAYS ago, the credits balance, the open
// plan's weekly credits and any hold running today.

type Rel<T> = T | T[] | null;
const one = <T>(v: Rel<T> | undefined): T | null => (Array.isArray(v) ? (v[0] ?? null) : (v ?? null));

// Embedded relations both queries add to their profiles select. Each also embeds bookings!client_id with at least booking_date and no_show
// (the dashboard reads more columns of the same rows), filtered by followUpFilters.
export const FOLLOW_UP_RELATIONS = 'credits_balance(balance), membership_holds!client_id(id)';

export interface FollowUpRow {
  created_at: string;
  client_profiles: Rel<{ onboarding_completed_at: string | null; checkin_reminder_days: number | null }>;
  credits_balance?: Rel<{ balance: number | null }>;
  // Open (not ended) plans and their weekly credits; a plan whose package cannot be read counts as no weekly credits.
  client_memberships: { ended_at: string | null; membership_packages: Rel<{ credits_per_week: number | null }> }[] | null;
  bookings: { booking_date: string; no_show?: boolean | null }[] | null;
  // Holds running today only (see followUpFilters).
  membership_holds?: { id: string }[] | null;
}

// The first day the lists read logs and bookings from.
export const followUpSince = (todayIso: string) => toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -FOLLOW_UP_WINDOW_DAYS));

// The filters on those relations: bookings still booked from the window's start (future ones included), and holds running today.
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- a PostgREST builder of any select shape
export function followUpFilters<Q extends { gte: any; eq: any; lte: any; or: any }>(q: Q, todayIso: string): Q {
  return q
    .gte('bookings.booking_date', followUpSince(todayIso))
    .eq('bookings.status', 'booked')
    .lte('membership_holds.started_on', todayIso)
    .or(`ended_on.is.null,ended_on.gte.${todayIso}`, { referencedTable: 'membership_holds' });
}

// One member's follow-up from their row and their logged days (rows with something on them, hasLoggedData).
export function followUpOfRow(row: FollowUpRow, loggedDays: { log_date: string; bodyweight: number | null }[], todayIso: string): FollowUp | null {
  const cp = one(row.client_profiles);
  const balance = one(row.credits_balance)?.balance;
  return followUpFor({
    todayIso,
    createdAt: row.created_at,
    onboarded: !!cp && cp.onboarding_completed_at != null,
    onHold: (row.membership_holds ?? []).length > 0,
    reminderDays: cp?.checkin_reminder_days,
    logs: loggedDays.map((l) => ({ date: l.log_date, bodyweight: l.bodyweight == null ? null : Number(l.bodyweight) })),
    // No row in the view means no ledger entries: 0.
    balance: row.credits_balance === undefined ? null : (balance ?? 0),
    weeklyCredits: (row.client_memberships ?? []).some((ms) => ms.ended_at === null && (one(ms.membership_packages)?.credits_per_week ?? 0) > 0),
    bookings: (row.bookings ?? []).map((b) => ({ date: b.booking_date, noShow: !!b.no_show })),
  });
}

export interface MemberFollowUps {
  // Members worth a conversation, and why, by member id.
  byClient: Record<string, FollowUp>;
  // Members who have not finished setting up the app: the Logging column says "Not set up" instead of a colour.
  notSetUp: string[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// The Clients page's follow-ups: the coach's own members and everyone at the gym (both of its scopes) in one query. `todayIso` is the gym's.
export async function getFollowUps(supabase: SupabaseClient, scope: { coachId: string; gymId: string | null }, todayIso: string): Promise<MemberFollowUps> {
  const filters = [UUID.test(scope.coachId) ? `coach_id.eq.${scope.coachId}` : null, scope.gymId && UUID.test(scope.gymId) ? `gym_id.eq.${scope.gymId}` : null].filter(Boolean);
  if (filters.length === 0) return { byClient: {}, notSetUp: [] };
  const { rows, error } = await fetchAllPages((from, to) =>
    followUpFilters(
      supabase
        .from('profiles')
        .select(
          `id, created_at, client_profiles(onboarding_completed_at, checkin_reminder_days),
           client_memberships!client_id(ended_at, membership_packages(credits_per_week)),
           daily_logs(log_date, bodyweight), bookings!client_id(booking_date, no_show), ${FOLLOW_UP_RELATIONS}`
        )
        .eq('role', 'client')
        .or(filters.join(','))
        // Only days with something logged on them (the blank row the Food screen makes for today does not count), from the window's start.
        .gte('daily_logs.log_date', followUpSince(todayIso))
        .or(LOGGED_DATA_FILTER, { referencedTable: 'daily_logs' }),
      todayIso
    )
      .order('id')
      .range(from, to)
  );
  if (error) raise(error);
  const byClient: Record<string, FollowUp> = {};
  const notSetUp: string[] = [];
  for (const row of rows as unknown as (FollowUpRow & { id: string; daily_logs: { log_date: string; bodyweight: number | null }[] | null })[]) {
    if (one(row.client_profiles)?.onboarding_completed_at == null) notSetUp.push(row.id);
    const f = followUpOfRow(row, row.daily_logs ?? [], todayIso);
    if (f) byClient[row.id] = f;
  }
  return { byClient, notSetUp };
}
