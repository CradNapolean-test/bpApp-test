'use server';

import { raise } from './errors';
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
