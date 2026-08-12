'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { ActivityEventRow } from './types';

export async function getRecentActivity(clientId?: string, limit = 100): Promise<ActivityEventRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_recent_client_activity', {
    p_client_id: clientId ?? null,
    p_limit: limit,
  });
  if (error) raise(error);
  return (data ?? []) as ActivityEventRow[];
}
