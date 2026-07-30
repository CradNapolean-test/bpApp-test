'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { DailyLogRow } from './types';

export async function getDailyLogs(
  clientId: string,
  fromDate: string,
  toDate: string
): Promise<DailyLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('client_id', clientId)
    .gte('log_date', fromDate)
    .lte('log_date', toDate)
    .order('log_date', { ascending: true });
  if (error) raise(error);
  return data ?? [];
}

export async function getDailyLog(clientId: string, logDate: string): Promise<DailyLogRow | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('*')
    .eq('client_id', clientId)
    .eq('log_date', logDate)
    .maybeSingle();
  if (error) raise(error);
  return data;
}

export async function getOrCreateDailyLog(clientId: string, logDate: string): Promise<DailyLogRow> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .upsert(
      { client_id: clientId, log_date: logDate },
      { onConflict: 'client_id,log_date' }
    )
    .select('*')
    .single();
  if (error) raise(error);
  return data;
}

export async function upsertDailyLog(
  clientId: string,
  logDate: string,
  fields: Partial<Omit<DailyLogRow, 'id' | 'client_id' | 'log_date'>>
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('daily_logs')
    .upsert(
      { client_id: clientId, log_date: logDate, ...fields },
      { onConflict: 'client_id,log_date' }
    );
  if (error) raise(error);
}
