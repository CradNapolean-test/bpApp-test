'use server';

import { fail, ok, type ActionResult } from './result';
import { resolveScopingGymId } from './coach';
import { createClient } from '@/lib/supabase/server';
import type { MembershipHoldRow, RedFlagEntry, RedFlagReport, RedFlagThresholds } from './types';

// The week's flagged members, the six-week grid and the team's notes. Writing the week's list happens inside
// (never over an existing one). Returns an error string rather than throwing, so the screen can say what is wrong
// (for example when migration 0098 has not been applied yet).
export async function getRedFlagReport(weekStart: string): Promise<{ report: RedFlagReport | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('red_flag_report', { p_week_start: weekStart });
  if (error) return { report: null, error: error.message };
  return { report: data as RedFlagReport, error: null };
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

export async function saveRedFlagThresholds(t: RedFlagThresholds): Promise<ActionResult> {
  const supabase = await createClient();
  const gymId = await resolveScopingGymId(supabase);
  const { error } = await supabase.from('red_flag_settings').upsert({ gym_id: gymId, ...t }, { onConflict: 'gym_id' });
  return error ? fail(error, 'Could not save the thresholds') : ok();
}

// ---- holds: a member on hold is left out of the red flag lists ----
export async function getActiveHold(clientId: string): Promise<MembershipHoldRow | null> {
  const supabase = await createClient();
  const today = new Date().toISOString().slice(0, 10);
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
