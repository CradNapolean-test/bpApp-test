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
