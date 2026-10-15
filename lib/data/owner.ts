'use server';

import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/lib/supabase/server';
import { fail, ok, type ActionResult } from './result';
import { LOAD_FAILED, type Loaded } from '@/lib/ownerReport';
import { blackoutProblem, normaliseReferralUrl, referralUrlProblem } from '@/lib/gymSettings';
import type { RosterFilter } from '@/lib/ownerRoster';

// Owner side: the organisation's gyms, who coaches in each, what happened this month, and the actions an owner may take on a gym's team.
// Reads come back as { ok, data, error } so a screen can offer "Try again" (R30); the technical reason goes to Sentry and is never shown.

function logFailure(where: string, error: unknown): void {
  const message = error && typeof error === 'object' && 'message' in error ? String((error as { message?: unknown }).message) : String(error);
  Sentry.captureException(error instanceof Error ? error : new Error(`${where}: ${message}`), { tags: { area: 'owner' }, extra: { where } });
}

export interface OwnerCoach {
  id: string;
  // The display name, or the login address when the coach has none.
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

// Every gym in the signed-in owner's organisation.
export async function getOwnerGyms(): Promise<Loaded<OwnerGym[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gyms_overview');
  if (error) {
    logFailure('owner_gyms_overview', error);
    return { ok: false, error: LOAD_FAILED };
  }
  return { ok: true, data: (data ?? []) as OwnerGym[] };
}

// The organisation's name, for the header (it was typed into the screen, and into a regex that shortened the gym names).
export async function getOwnerOrganisationName(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('organisations').select('name').limit(1).maybeSingle();
  if (error) {
    logFailure('organisations', error);
    return null;
  }
  const name = (data?.name as string | null | undefined)?.trim();
  return name || null;
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
  // Every client row at the gym, finished onboarding or not.
  members: number;
  // Members who finished onboarding (migration 0144); the Reports page counts these.
  onboarded?: number;
  onPlan: number;
  newThisMonth: number;
  // Had a plan end in the last 30 days and have none now.
  leftLast30: number;
  endingSoon: number;
  attendedThisMonth: number;
  attendedLastMonth: number;
  // Last month's attended bookings up to the same day of the month as today, and that day (migration 0144).
  attendedLastMonthToDate?: number;
  dayOfMonth?: number;
  // Past bookings nobody marked attended or no-show.
  unmarkedSessions: number;
  plans: { name: string; count: number }[];
  // The latest week the red flag tracker has entries for; null if it has never run.
  redFlags: { weekStart: string; flagged: number; waiting: number } | null;
  team: OwnerTeamRow[];
}

// The figures behind the owner's Overview, one entry per gym.
export async function getOwnerGymStats(): Promise<Loaded<OwnerGymStats[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gym_stats');
  if (error) {
    logFailure('owner_gym_stats', error);
    return { ok: false, error: LOAD_FAILED };
  }
  return { ok: true, data: (data ?? []) as OwnerGymStats[] };
}

// ---- Reports: check-ins and coach messages (migration 0120) ----

export interface ActivityReport {
  // Members who finished onboarding in the chosen gym(s); the base for every percentage.
  members: number;
  // Every member, finished onboarding or not (migration 0144).
  allMembers?: number;
  // The gym's calendar date, and how many complete weeks the weekday averages cover (migration 0144).
  today?: string;
  weekdayWeeks?: number;
  // Last 28 days, oldest first. checkIns = members who logged anything that day.
  perDay: { date: string; checkIns: number; pct: number }[];
  // Last N weeks (Monday start), oldest first.
  perWeek: { weekStart: string; checkIns: number; activeMembers: number; pct: number; coachMessages: number; memberMessages: number }[];
  // Average share of members checking in on each weekday (1 = Monday) over the complete weeks since logging began (up to 8).
  byWeekday: { dow: number; avgPct: number }[];
  coaches: { coachId: string; name: string; members: number; sent30: number; membersMessaged30: number; checkedInThisWeek: number }[];
}

// gymId null = every gym in the organisation. Owners only (the database refuses anyone else).
export async function getOwnerActivityReport(gymId: string | null, weeks = 12): Promise<Loaded<ActivityReport>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_activity_report', { p_gym: gymId, p_weeks: weeks });
  if (error || !data) {
    logFailure('owner_activity_report', error ?? new Error('empty answer'));
    return { ok: false, error: LOAD_FAILED };
  }
  return { ok: true, data: data as ActivityReport };
}

// ---- The roster of one gym (read only, no health data) ----

export interface RosterMember {
  clientId: string;
  name: string;
  email: string;
  coachId: string | null;
  coachName: string | null;
  plan: string | null;
  planEndsOn: string | null;
  status: 'on_plan' | 'ending_soon' | 'no_plan';
  lastActive: string | null;
  onboarded: boolean;
  flagged: boolean;
  joinedOn: string | null;
}

export interface OwnerRoster {
  gymId: string;
  total: number;
  limit: number;
  offset: number;
  filter: RosterFilter | null;
  members: RosterMember[];
}

export async function getOwnerGymRoster(
  gymId: string,
  options: { filter?: RosterFilter | null; search?: string; limit?: number; offset?: number } = {}
): Promise<Loaded<OwnerRoster>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_gym_roster', {
    p_gym: gymId,
    p_filter: options.filter ?? null,
    p_search: options.search?.trim() || null,
    p_limit: options.limit ?? 50,
    p_offset: options.offset ?? 0,
  });
  if (error || !data) {
    logFailure('owner_gym_roster', error ?? new Error('empty answer'));
    return { ok: false, error: LOAD_FAILED };
  }
  return { ok: true, data: data as OwnerRoster };
}

// ---- What an owner may do to a gym's team and settings ----
// Each goes through the owner_* function of migration 0131, which checks the gym belongs to the owner's organisation; the page checks too,
// but the database is the gate.

export async function ownerSetGymAdmin(gymId: string, coachId: string, isAdmin: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_set_gym_admin', { p_gym: gymId, p_coach: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not change admin rights') : ok();
}

export async function ownerAddCoachToGym(gymId: string, coachId: string, isAdmin: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_add_coach_to_gym', { p_gym: gymId, p_coach: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not add that coach to the gym') : ok();
}

export type RemoveCoachResult = { ok: true; deactivated: boolean } | { ok: false; error: string };

// Refused by the database while the coach still has members at the gym, and for the last admin. `deactivated` is true when the coach has no
// gym left: the screen then calls /api/gym/deactivate-coach to stop the login working.
export async function ownerRemoveCoachFromGym(gymId: string, coachId: string): Promise<RemoveCoachResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_remove_coach_from_gym', { p_gym: gymId, p_coach: coachId });
  if (error) {
    const failed = fail(error, 'Could not remove that coach');
    return failed.ok ? { ok: false, error: 'Could not remove that coach' } : failed;
  }
  return { ok: true, deactivated: (data as { deactivated?: boolean } | null)?.deactivated === true };
}

export type ReassignResult = { ok: true; moved: number } | { ok: false; error: string };

export async function ownerReassignClients(gymId: string, fromCoachId: string, toCoachId: string): Promise<ReassignResult> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('owner_reassign_clients', { p_gym: gymId, p_from: fromCoachId, p_to: toCoachId });
  if (error) {
    const failed = fail(error, 'Could not move the members');
    return failed.ok ? { ok: false, error: 'Could not move the members' } : failed;
  }
  return { ok: true, moved: typeof data === 'number' ? data : 0 };
}

export async function ownerRenameGym(gymId: string, name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_rename_gym', { p_gym: gymId, p_name: name });
  return error ? fail(error, 'Could not rename the gym') : ok();
}

export async function ownerSetBookingSettings(
  gymId: string,
  timezone: string,
  blackoutStart: string | null,
  blackoutEnd: string | null
): Promise<ActionResult> {
  const problem = blackoutProblem(blackoutStart != null && blackoutEnd != null, blackoutStart ?? '', blackoutEnd ?? '');
  if (problem) return fail({ message: problem });
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_set_gym_booking_settings', {
    p_gym: gymId,
    p_timezone: timezone,
    p_blackout_start: blackoutStart,
    p_blackout_end: blackoutEnd,
  });
  return error ? fail(error, 'Could not save the booking rules') : ok();
}

export async function ownerSetReferralUrl(gymId: string, url: string): Promise<ActionResult> {
  const problem = referralUrlProblem(url);
  if (problem) return fail({ message: problem });
  const supabase = await createClient();
  const { error } = await supabase.rpc('owner_set_gym_referral_url', { p_gym: gymId, p_url: normaliseReferralUrl(url) });
  return error ? fail(error, 'Could not save the referral link') : ok();
}

// What the owner's gym page shows beside the roster: the settings the forms start from.
export interface OwnerGymSettings {
  id: string;
  name: string;
  timezone: string;
  blackoutStart: string | null;
  blackoutEnd: string | null;
  referralUrl: string | null;
}

export async function getOwnerGymSettings(gymId: string): Promise<OwnerGymSettings | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('gyms')
    .select('id, name, timezone, blackout_start, blackout_end, referral_url')
    .eq('id', gymId)
    .maybeSingle();
  if (error || !data) {
    // referral_url arrives with migration 0138; read again without it so an older database still shows the page.
    const retry = await supabase.from('gyms').select('id, name, timezone, blackout_start, blackout_end').eq('id', gymId).maybeSingle();
    if (retry.error || !retry.data) {
      if (retry.error) logFailure('gyms', retry.error);
      return null;
    }
    return {
      id: retry.data.id as string,
      name: retry.data.name as string,
      timezone: (retry.data.timezone as string | null) || 'UTC',
      blackoutStart: (retry.data.blackout_start as string | null) ?? null,
      blackoutEnd: (retry.data.blackout_end as string | null) ?? null,
      referralUrl: null,
    };
  }
  return {
    id: data.id as string,
    name: data.name as string,
    timezone: (data.timezone as string | null) || 'UTC',
    blackoutStart: (data.blackout_start as string | null) ?? null,
    blackoutEnd: (data.blackout_end as string | null) ?? null,
    referralUrl: (data.referral_url as string | null) ?? null,
  };
}
