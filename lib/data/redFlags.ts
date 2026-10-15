'use server';

import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import { gymToday } from '@/lib/redFlagWeek';
import { DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { MembershipHoldRow, RedFlagEntry, RedFlagReport, RedFlagThresholds } from './types';

// The week's flagged members, the six-week grid and the team's notes, for ONE gym (migration 0129). `gymId` is the gym being looked at:
// a coach who works in two can ask for either; left out it is the active gym. Reading never writes: a week whose list was not written
// comes back with `generated: false` (see generateLatestRedFlagWeek). Returns an error string rather than throwing, so the screen can
// say what is wrong.
export async function getRedFlagReport(
  weekStart: string,
  gymId?: string | null
): Promise<{ report: RedFlagReport | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('red_flag_report', gymId ? { p_week_start: weekStart, p_gym: gymId } : { p_week_start: weekStart });
  if (error) return { report: null, error: error.message };
  return { report: data as RedFlagReport, error: null };
}

// Writes the list for the last finished week now instead of waiting for the early-Monday job. Gym admins and the owner only; the database
// refuses a second call within ten minutes.
export async function generateLatestRedFlagWeek(gymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc('generate_latest_red_flag_week', { p_gym: gymId ?? null });
  return error ? fail(error, 'Could not generate the list') : ok();
}

export async function updateRedFlagEntry(
  id: string,
  fields: Partial<Pick<RedFlagEntry, 'contacted' | 'reason' | 'tier' | 'coach_id'>>
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('red_flag_entries')
    .update({ ...fields, updated_at: new Date().toISOString() })
    .eq('id', id);
  return error ? fail(error, 'Could not save that') : ok();
}

// `gymId`: the gym whose thresholds these are (the one on screen); left out it is the active gym.
export async function saveRedFlagThresholds(t: RedFlagThresholds, gymId?: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const gym = gymId ?? (await resolveScopingGymId(supabase));
  const { error } = await supabase.from('red_flag_settings').upsert({ gym_id: gym, ...t }, { onConflict: 'gym_id' });
  return error ? fail(error, 'Could not save the thresholds') : ok();
}

// The timezone of a gym, falling back to the app default when it cannot be read.
async function timezoneOfGym(gymId: string | null): Promise<string> {
  if (!gymId) return DEFAULT_TIMEZONE;
  const supabase = await createClient();
  const { data } = await supabase.from('gyms').select('timezone').eq('id', gymId).maybeSingle();
  return (data?.timezone as string | null | undefined) || DEFAULT_TIMEZONE;
}

// ---- holds: a member on hold is left out of the red flag lists ----
// "Today" is the date at the MEMBER'S gym, not UTC: a hold that starts today in Auckland is already running there while it is still
// yesterday in UTC (CM6).
export async function getActiveHold(clientId: string): Promise<MembershipHoldRow | null> {
  const supabase = await createClient();
  const { data: owner } = await supabase.from('profiles').select('gym_id').eq('id', clientId).maybeSingle();
  const today = gymToday(await timezoneOfGym((owner?.gym_id as string | null | undefined) ?? null));
  const { data } = await supabase
    .from('membership_holds')
    .select('id, client_id, started_on, ended_on, note')
    .eq('client_id', clientId)
    .lte('started_on', today)
    .or(`ended_on.is.null,ended_on.gte.${today}`)
    .order('started_on', { ascending: false })
    .limit(1);
  return (data?.[0] as MembershipHoldRow | undefined) ?? null;
}

export async function startHold(clientId: string, startedOn: string, note: string | null): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.from('membership_holds').insert({ client_id: clientId, started_on: startedOn, note });
  return error ? fail(error, 'Could not put them on hold') : ok();
}

// Members whose membership is on hold today (for the Clients list), by the date at the gym being worked in. Empty if the table cannot
// be read.
export async function getActiveHoldClientIds(): Promise<string[]> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase).catch(() => null);
  const today = gymToday(await timezoneOfGym(gymId));
  const { data } = await supabase
    .from('membership_holds')
    .select('client_id')
    .lte('started_on', today)
    .or(`ended_on.is.null,ended_on.gte.${today}`);
  return [...new Set((data ?? []).map((h) => h.client_id as string))];
}

// Resuming means they are back from today: the hold's last day was yesterday. A hold that only started today never
// really ran, so it is removed.
export async function endHold(holdId: string, today: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: hold } = await supabase.from('membership_holds').select('started_on').eq('id', holdId).maybeSingle();
  if (!hold) return fail(null, 'That hold was not found');
  if (hold.started_on >= today) {
    const { error } = await supabase.from('membership_holds').delete().eq('id', holdId);
    return error ? fail(error, 'Could not end the hold') : ok();
  }
  const yesterday = new Date(`${today}T00:00:00Z`);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);
  const { error } = await supabase.from('membership_holds').update({ ended_on: yesterday.toISOString().slice(0, 10) }).eq('id', holdId);
  return error ? fail(error, 'Could not end the hold') : ok();
}
