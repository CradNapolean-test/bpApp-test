'use server';

import { raise } from './errors';
import { fail, ok, type ActionResult } from './result';
import { createClient } from '@/lib/supabase/server';

export async function getDisabledScreens(clientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('client_disabled_screens').select('screen').eq('client_id', clientId);
  if (error) raise(error);
  return (data ?? []).map((r) => r.screen);
}

export async function setScreenEnabled(clientId: string, screen: string, enabled: boolean): Promise<void> {
  const supabase = await createClient();
  if (enabled) {
    const { error } = await supabase.from('client_disabled_screens').delete().eq('client_id', clientId).eq('screen', screen);
    if (error) raise(error);
  } else {
    const { error } = await supabase
      .from('client_disabled_screens')
      .upsert({ client_id: clientId, screen }, { onConflict: 'client_id,screen' });
    if (error) raise(error);
  }
}

// Same as setScreenEnabled, but hands back a result the UI can show instead of throwing (Next.js redacts
// thrown server action messages in production). Used by the coach's per-member screen toggles.
export async function setMemberScreenEnabled(clientId: string, screen: string, enabled: boolean): Promise<ActionResult> {
  try {
    await setScreenEnabled(clientId, screen, enabled);
    return ok();
  } catch (e) {
    return fail(e instanceof Error ? e : null, 'Could not change that screen');
  }
}

// ---- Daily check-in measures switched off for a member (client_disabled_metrics, 0121) ----

export async function getDisabledMetrics(clientId: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.from('client_disabled_metrics').select('metric').eq('client_id', clientId);
  if (error) {
    // Migration 0121 not applied yet: nothing is switched off.
    if (error.code === '42P01' || error.code === 'PGRST205') return [];
    raise(error);
  }
  return (data ?? []).map((r) => r.metric as string);
}

// Coach only (RLS: is_coach_of). Returns a result the UI can show instead of throwing.
export async function setMemberMetricEnabled(clientId: string, metric: string, enabled: boolean): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = enabled
    ? await supabase.from('client_disabled_metrics').delete().eq('client_id', clientId).eq('metric', metric)
    : await supabase.from('client_disabled_metrics').upsert({ client_id: clientId, metric }, { onConflict: 'client_id,metric' });
  return error ? fail(error, 'Could not change that measure') : ok();
}
