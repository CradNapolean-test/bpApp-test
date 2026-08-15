'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import { todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { HabitWithLogs } from './types';

const ADHERENCE_WINDOW_DAYS = 30;

// clientTimezone lets callers that already have the client's profile (e.g.
// loadDashboardBundle) pass it through, so the 30-day lookback window is anchored to the
// client's own local date rather than the server's UTC one -- lower-stakes than the "which
// day is this" fix elsewhere (this only shifts a lookback boundary by at most a day), but
// free to get right once the caller already has the timezone in hand.
export async function getHabitsWithLogs(
  clientId: string,
  clientTimezone: string = DEFAULT_TIMEZONE
): Promise<HabitWithLogs[]> {
  const supabase = await createClient();
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at');
  if (habitsError) raise(habitsError);
  if (!habits || habits.length === 0) return [];

  const todayIso = todayIsoInTz(clientTimezone);
  const since = new Date(`${todayIso}T00:00:00Z`);
  since.setUTCDate(since.getUTCDate() - ADHERENCE_WINDOW_DAYS);
  const sinceIso = since.toISOString().slice(0, 10);

  const { data: logs, error: logsError } = await supabase
    .from('habit_logs')
    .select('*')
    .in(
      'habit_id',
      habits.map((h) => h.id)
    )
    .gte('log_date', sinceIso);
  if (logsError) raise(logsError);

  return habits.map((habit) => ({
    ...habit,
    logs: (logs ?? []).filter((l) => l.habit_id === habit.id),
  }));
}

export async function createHabit(clientId: string, name: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('habits').insert({ client_id: clientId, name });
  if (error) raise(error);
}

export async function deleteHabit(habitId: string): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase.from('habits').delete().eq('id', habitId);
  if (error) raise(error);
}

export async function toggleHabitLog(habitId: string, logDate: string, completed: boolean): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('habit_logs')
    .upsert({ habit_id: habitId, log_date: logDate, completed }, { onConflict: 'habit_id,log_date' });
  if (error) raise(error);
}
