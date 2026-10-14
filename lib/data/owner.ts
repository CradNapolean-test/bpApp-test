'use server';

import { createClient } from '@/lib/supabase/server';
import { raise } from './errors';

// Owner side: the organisation's gyms and who coaches in each. Needs migrations 0102 and 0103.

export interface OwnerCoach {
  id: string;
  name: string;
  email: string;
  isAdmin: boolean;
  // Members assigned to this coach at this gym.
  members: number;
}

export interface OwnerGym {
  id: string;
  name: string;
  members: number;
  coaches: OwnerCoach[];
}

// Every gym in the signed-in owner's organisation. Throws for anyone who is not an owner.
export async function getOwnerGyms(): Promise<OwnerGym[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gyms_overview');
  if (error) raise(error);
  return (data ?? []) as OwnerGym[];
}

export interface OwnerTeamRow {
  coachId: string;
  name: string;
  isAdmin: boolean;
  members: number;
  // Members who finished onboarding, and how many of those logged this week / nothing for 7+ days.
  eligible: number;
  checkedIn: number;
  quiet: number;
  toReview: number;
}

export interface OwnerGymStats {
  gymId: string;
  members: number;
  onPlan: number;
  newThisMonth: number;
  // Had a plan end in the last 30 days and have none now.
  leftLast30: number;
  endingSoon: number;
  attendedThisMonth: number;
  attendedLastMonth: number;
  // Past bookings nobody marked attended or no-show.
  unmarkedSessions: number;
  plans: { name: string; count: number }[];
  // The latest week the red flag tracker has entries for; null if it has never run.
  redFlags: { weekStart: string; flagged: number; waiting: number } | null;
  team: OwnerTeamRow[];
}

// The figures behind the owner's Overview, one entry per gym. Needs migration 0104; null until then.
export async function getOwnerGymStats(): Promise<OwnerGymStats[] | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gym_stats');
  if (error) return null;
  return (data ?? []) as OwnerGymStats[];
}

// ---- Reports: check-ins and coach messages (migration 0120) ----

export interface ActivityReport {
  // Members who finished onboarding in the chosen gym(s); the base for every percentage.
  members: number;
  // Last 28 days, oldest first. checkIns = members who logged anything that day.
  perDay: { date: string; checkIns: number; pct: number }[];
  // Last N weeks (Monday start), oldest first.
  perWeek: { weekStart: string; checkIns: number; activeMembers: number; pct: number; coachMessages: number; memberMessages: number }[];
  // Average share of members checking in on each weekday (1 = Monday) over the last 8 complete weeks.
  byWeekday: { dow: number; avgPct: number }[];
  coaches: { coachId: string; name: string; members: number; sent30: number; membersMessaged30: number; checkedInThisWeek: number }[];
}

// gymId null = every gym in the organisation. Owners only (the database refuses anyone else).
export async function getOwnerActivityReport(gymId: string | null, weeks = 12): Promise<ActivityReport | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_activity_report', { p_gym: gymId, p_weeks: weeks });
  if (error) return null;
  return data as ActivityReport;
}
