'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { LOGGED_DATA_FILTER } from '@/lib/utils/dailyLog';
import { addDays, startOfWeek, toIsoDate } from '@/lib/utils/dates';
import { HIGH_DAYS_PER_WEEK, highDaysLeft } from '@/lib/utils/dayTarget';
import type { DailyLogRow } from './types';

// ---- calorie cycling: high days ----
// The Monday-to-Sunday week a date is in.
function weekAround(logDate: string): { from: string; to: string } {
  const monday = startOfWeek(new Date(`${logDate}T00:00:00Z`));
  return { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) };
}

// The days of that week the member marked as high days (for "2 high days left this week"). A coach can read them too.
export async function getHighDaysInWeek(clientId: string, logDate: string): Promise<string[]> {
  const supabase = await createClient();
  const { from, to } = weekAround(logDate);
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('client_id', clientId)
    .eq('day_type', 'high')
    .gte('log_date', from)
    .lte('log_date', to);
  if (error) raise(error);
  return (data ?? []).map((r) => r.log_date as string);
}

// A cycling member makes a day a high day, or back to a normal (low) day. At most HIGH_DAYS_PER_WEEK high days a week. Only the
// member can change their own days (daily_logs' update policy is the member's own rows). Returns the week's high days afterwards.
export async function setHighDay(clientId: string, logDate: string, high: boolean): Promise<string[]> {
  const others = (await getHighDaysInWeek(clientId, logDate)).filter((d) => d !== logDate);
  if (high && highDaysLeft(others.map(() => 'high' as const)) === 0) {
    throw new Error(`You already have ${HIGH_DAYS_PER_WEEK} high days this week. Make one of them a normal day first.`);
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from('daily_logs')
    .upsert({ client_id: clientId, log_date: logDate, day_type: high ? 'high' : 'flat' }, { onConflict: 'client_id,log_date' });
  if (error) raise(error);
  return high ? [...others, logDate].sort() : others;
}

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

// The days a member logged anything on, newest first, back to `fromDate`: the dashboard's streak looks back a year, not 84 days (L2).
export async function getLoggedDates(clientId: string, fromDate: string): Promise<string[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('client_id', clientId)
    .gte('log_date', fromDate)
    .or(LOGGED_DATA_FILTER)
    .order('log_date', { ascending: false })
    .limit(1000);
  if (error) raise(error);
  return (data ?? []).map((r) => r.log_date as string);
}

// The first day they ever logged anything on, for working out which week of the programme they are on (L1).
export async function getFirstLoggedDate(clientId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('client_id', clientId)
    .or(LOGGED_DATA_FILTER)
    .order('log_date', { ascending: true })
    .limit(1);
  if (error) raise(error);
  return (data?.[0]?.log_date as string | undefined) ?? null;
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
