'use server';

import { raise } from './errors';
import { createClient } from '@/lib/supabase/server';
import type { HabitWithLogs } from './types';

const ADHERENCE_WINDOW_DAYS = 30;

export async function getHabitsWithLogs(clientId: string): Promise<HabitWithLogs[]> {
  const supabase = await createClient();
  const { data: habits, error: habitsError } = await supabase
    .from('habits')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at');
  if (habitsError) raise(habitsError);
  if (!habits || habits.length === 0) return [];

  const since = new Date();
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
