'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { checkActiveGym } from './gymGuard';
import { createClient } from '@/lib/supabase/server';
import { gymMismatch, type GymMismatch } from '@/lib/gymMismatch';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import { blackoutProblem, normaliseReferralUrl, referralUrlProblem } from '@/lib/gymSettings';
import type { ReassignResult, RemoveCoachResult } from './owner';

export interface GymCoachRow {
  id: string;
  email: string;
  displayName: string | null;
  isGymAdmin: boolean;
  // Members assigned to this coach at this gym: what a reassign would move, and why removing the coach is refused while it is not 0.
  members: number;
}

// Every coach who belongs to the caller's active gym, via coach_gym_memberships (0056) rather
// than filtering profiles.gym_id directly -- a gym-mate who's currently active on a *different*
// gym would be missed by a direct profiles.gym_id filter, since that column now only reflects
// each coach's own currently-selected gym, not every gym they're a member of. isGymAdmin comes
// from the membership row for this specific gym, not the (possibly stale-for-this-gym)
// profiles.is_gym_admin cache.
export async function getGymRoster(): Promise<GymCoachRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: caller } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();
  if (!caller?.gym_id) return [];

  const { data, error } = await supabase
    .from('coach_gym_memberships')
    .select('coach_id, is_gym_admin, coach:coach_id(id, email, display_name)')
    .eq('gym_id', caller.gym_id)
    .order('created_at');
  if (error) raise(error);

  const counts = await Promise.all(
    (data ?? []).map(async (row) => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('coach_id', row.coach_id)
        .eq('gym_id', caller.gym_id);
      return count ?? 0;
    })
  );

  return (data ?? []).map((row, i) => {
    const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
    return {
      id: row.coach_id,
      email: coach?.email ?? '',
      displayName: coach?.display_name ?? null,
      isGymAdmin: row.is_gym_admin,
      members: counts[i],
    };
  });
}

export interface MyGymRow {
  gymId: string;
  gymName: string;
  // The gym's own timezone (IANA name): its weeks, "today" and class times follow this, not the coach's browser.
  timezone: string;
  isGymAdmin: boolean;
  isActive: boolean;
}

// Every gym the caller (as a coach) belongs to -- powers the gym switcher. Only rendered by the
// UI when this returns more than one row; a single-gym coach's experience is unchanged.
export async function getMyGyms(): Promise<MyGymRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: caller } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();

  const { data, error } = await supabase
    .from('coach_gym_memberships')
    .select('gym_id, is_gym_admin, gym:gym_id(name, timezone)')
    .eq('coach_id', user.id)
    .order('created_at');
  if (error) raise(error);

  return (data ?? []).map((row) => {
    const gym = Array.isArray(row.gym) ? row.gym[0] : row.gym;
    return {
      gymId: row.gym_id,
      gymName: gym?.name ?? 'Unknown gym',
      timezone: gym?.timezone || DEFAULT_TIMEZONE,
      isGymAdmin: row.is_gym_admin,
      isActive: row.gym_id === caller?.gym_id,
    };
  });
}

// Where the coach's own members are, against where the coach is looking (R38). Returns the warning to show, or null when there is
// nothing to say: a coach in one gym, members in the active gym, or no members. Pass the gyms you already loaded to save the lookup.
export async function getClientGymMismatch(gyms?: MyGymRow[]): Promise<GymMismatch | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const mine = gyms ?? (await getMyGyms());
  if (mine.length < 2) return null;
  const counts = await Promise.all(
    mine.map(async (g) => {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('role', 'client')
        .eq('coach_id', user.id)
        .eq('gym_id', g.gymId);
      return { gymId: g.gymId, gymName: g.gymName, count: count ?? 0 };
    })
  );
  return gymMismatch(counts, mine.find((g) => g.isActive)?.gymId ?? null);
}

// The timezone of one gym (IANA name), for screens about a member who may belong to a different gym from the coach's active one.
export async function getGymTimezone(gymId: string | null): Promise<string> {
  return (await getGymBookingRules(gymId)).timezone;
}

// The gym's own booking settings: its timezone and the overnight window that does not count towards a cancellation cut-off (0064). The
// booking screen takes these from here rather than from whichever session happens to be first on the timetable (L5).
export async function getGymBookingRules(gymId: string | null): Promise<{ timezone: string; blackoutStart: string | null; blackoutEnd: string | null }> {
  if (!gymId) return { timezone: DEFAULT_TIMEZONE, blackoutStart: null, blackoutEnd: null };
  const supabase = await createClient();
  const { data } = await supabase.from('gyms').select('timezone, blackout_start, blackout_end').eq('id', gymId).maybeSingle();
  return {
    timezone: (data?.timezone as string | null | undefined) || DEFAULT_TIMEZONE,
    blackoutStart: (data?.blackout_start as string | null | undefined) ?? null,
    blackoutEnd: (data?.blackout_end as string | null | undefined) ?? null,
  };
}

// The page a member shares to refer a friend (gyms.referral_url, migration 0138), or null when their gym has none or the column is not
// there yet. The Refer a friend screen is hidden for null (R16, D7).
export async function getGymReferralUrl(gymId: string | null): Promise<string | null> {
  if (!gymId) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from('gyms').select('referral_url').eq('id', gymId).maybeSingle();
  if (error) return null;
  const url = (data?.referral_url as string | null | undefined)?.trim();
  return url && /^https:\/\//i.test(url) ? url : null;
}

// Moves the caller's active-gym pointer (profiles.gym_id/is_gym_admin) to a gym they already
// belong to -- switch_active_gym (0056) validates membership server-side. Callers should
// router.refresh() (or navigate) afterward since every server-loaded page depends on this.
export async function switchActiveGym(gymId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('switch_active_gym', { p_gym_id: gymId });
  return error ? fail(error, 'Could not switch gyms') : ok();
}

// expectedGymId (on the settings and roster actions below): the gym the page was drawn for; see lib/data/gymGuard.ts (R28).
export async function renameGym(name: string, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('set_gym_name', { p_name: name });
  return error ? fail(error, 'Could not rename the gym') : ok();
}

// Timezone and the cancellation blackout window (migration 0064 columns, 0069 RPC). A null
// blackout means no blackout window.
export async function updateGymBookingSettings(
  timezone: string,
  blackoutStart: string | null,
  blackoutEnd: string | null,
  expectedGymId?: string | null
): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const problem = blackoutProblem(blackoutStart != null && blackoutEnd != null, blackoutStart ?? '', blackoutEnd ?? '');
  if (problem) return fail({ message: problem });
  const { error } = await supabase.rpc('set_gym_booking_settings', {
    p_timezone: timezone,
    p_blackout_start: blackoutStart,
    p_blackout_end: blackoutEnd,
  });
  return error ? fail(error, 'Could not save the booking rules') : ok();
}

export async function setCoachAdmin(coachId: string, isAdmin: boolean, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('set_gym_admin', { p_coach_id: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not update admin rights') : ok();
}

// Grants an already-existing coach account membership at the caller's active gym --
// add_coach_to_gym (0056) checks the caller's own admin rights server-side. Distinct from
// creating a brand-new account, which stays in app/api/gym/create-coach/route.ts (needs the
// admin client to call auth.admin.createUser, which no RPC can do).
export async function addCoachToGym(coachId: string, isAdmin: boolean, expectedGymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('add_coach_to_gym', { p_coach_id: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not add that coach to the gym') : ok();
}

// The page members are sent to when they refer a friend (gyms.referral_url, migrations 0138 and 0144). A blank value clears it.
export async function setGymReferralUrl(url: string, expectedGymId?: string | null): Promise<ActionResult> {
  const problem = referralUrlProblem(url);
  if (problem) return fail({ message: problem });
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale) return stale;
  const { error } = await supabase.rpc('set_gym_referral_url', { p_url: normaliseReferralUrl(url) });
  return error ? fail(error, 'Could not save the referral link') : ok();
}

// CH1: move every member of one coach at the caller's gym to another coach (reassign_clients, migration 0131; a gym admin of that gym).
export async function reassignClients(fromCoachId: string, toCoachId: string, expectedGymId?: string | null): Promise<ReassignResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale && !stale.ok) return stale;
  const { data: caller } = await supabase.from('profiles').select('gym_id').single();
  if (!caller?.gym_id) return { ok: false, error: 'You are not set up at a gym yet' };
  const { data, error } = await supabase.rpc('reassign_clients', { p_gym: caller.gym_id, p_from: fromCoachId, p_to: toCoachId });
  if (error) {
    const failed = fail(error, 'Could not move the members');
    return failed.ok ? { ok: false, error: 'Could not move the members' } : failed;
  }
  return { ok: true, moved: typeof data === 'number' ? data : 0 };
}

// CH1: take a coach out of the caller's gym (remove_coach_from_gym, migration 0131). The database refuses while the coach still has members
// there and for the last admin; those messages come back as they are. "deactivated" is true when the coach has no gym left: the screen then
// calls /api/gym/deactivate-coach so the login stops working.
export async function removeCoachFromGym(coachId: string, expectedGymId?: string | null): Promise<RemoveCoachResult> {
  const supabase = await createClient();
  const stale = await checkActiveGym(supabase, expectedGymId);
  if (stale && !stale.ok) return stale;
  const { data: caller } = await supabase.from('profiles').select('gym_id').single();
  if (!caller?.gym_id) return { ok: false, error: 'You are not set up at a gym yet' };
  const { data, error } = await supabase.rpc('remove_coach_from_gym', { p_gym: caller.gym_id, p_coach: coachId });
  if (error) {
    const failed = fail(error, 'Could not remove that coach');
    return failed.ok ? { ok: false, error: 'Could not remove that coach' } : failed;
  }
  return { ok: true, deactivated: (data as { deactivated?: boolean } | null)?.deactivated === true };
}
