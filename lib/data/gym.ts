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

// Every coach at the caller's own gym -- relies on the "same-gym coaches read each other"
// profiles policy (0052), not a service-role lookup, so this only ever returns what the
// caller's own gym membership already grants.
export async function getGymRoster(): Promise<GymCoachRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: caller } = await supabase.from('profiles').select('gym_id').eq('id', user.id).single();
  if (!caller?.gym_id) return [];

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, display_name, is_gym_admin')
    .eq('role', 'coach')
    .eq('gym_id', caller.gym_id)
    .order('created_at');
  if (error) raise(error);

  return (data ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    isGymAdmin: row.is_gym_admin,
  }));
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
