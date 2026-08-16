'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';

export interface GymCoachRow {
  id: string;
  email: string;
  displayName: string | null;
  isGymAdmin: boolean;
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

  return (data ?? []).map((row) => {
    const coach = Array.isArray(row.coach) ? row.coach[0] : row.coach;
    return {
      id: row.coach_id,
      email: coach?.email ?? '',
      displayName: coach?.display_name ?? null,
      isGymAdmin: row.is_gym_admin,
    };
  });
}

export interface MyGymRow {
  gymId: string;
  gymName: string;
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
    .select('gym_id, is_gym_admin, gym:gym_id(name)')
    .eq('coach_id', user.id)
    .order('created_at');
  if (error) raise(error);

  return (data ?? []).map((row) => {
    const gym = Array.isArray(row.gym) ? row.gym[0] : row.gym;
    return {
      gymId: row.gym_id,
      gymName: gym?.name ?? 'Unknown gym',
      isGymAdmin: row.is_gym_admin,
      isActive: row.gym_id === caller?.gym_id,
    };
  });
}

// Moves the caller's active-gym pointer (profiles.gym_id/is_gym_admin) to a gym they already
// belong to -- switch_active_gym (0056) validates membership server-side. Callers should
// router.refresh() (or navigate) afterward since every server-loaded page depends on this.
export async function switchActiveGym(gymId: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('switch_active_gym', { p_gym_id: gymId });
  return error ? fail(error, 'Could not switch gyms') : ok();
}

export async function renameGym(name: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_gym_name', { p_name: name });
  return error ? fail(error, 'Could not rename the gym') : ok();
}

export async function setCoachAdmin(coachId: string, isAdmin: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('set_gym_admin', { p_coach_id: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not update admin rights') : ok();
}

// Grants an already-existing coach account membership at the caller's active gym --
// add_coach_to_gym (0056) checks the caller's own admin rights server-side. Distinct from
// creating a brand-new account, which stays in app/api/gym/create-coach/route.ts (needs the
// admin client to call auth.admin.createUser, which no RPC can do).
export async function addCoachToGym(coachId: string, isAdmin: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('add_coach_to_gym', { p_coach_id: coachId, p_is_admin: isAdmin });
  return error ? fail(error, 'Could not add that coach to the gym') : ok();
}
