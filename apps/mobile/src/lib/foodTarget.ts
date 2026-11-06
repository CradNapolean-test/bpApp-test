import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { weeklyTarget } from '@ballistic/shared/calculations';
import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import { addDays, startOfWeek, toIsoDate } from '@ballistic/shared/utils/dates';
import { dayTargetFor, HIGH_DAYS_PER_WEEK, highDaysLeft, isCyclingTarget } from '@ballistic/shared/utils/dayTarget';
import { programWeekFromLogs } from '@ballistic/shared/utils/streak';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useRecentLogs } from '@/lib/today';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The Monday-to-Sunday week a date is in.
function weekAround(date: string): { from: string; to: string } {
  const monday = startOfWeek(new Date(`${date}T00:00:00Z`));
  return { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) };
}

function useWeekTarget(profile: ClientProfileRow | null, today: string) {
  const logsQ = useRecentLogs(today, !!profile);
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  return useMemo(() => {
    const engine = toMemberEngineProfile(profile, false); // none while the plan waits for the coach (M8, D6)
    return engine ? weeklyTarget(engine, programWeekFromLogs(logs, today)) : null;
  }, [profile, logs, today]);
}

// Calorie cycling: the days of `date`'s week the member made high days (the web reads them the same way). Under the
// ['daily-logs', userId] key, so any daily log change marks it stale.
function useHighDays(date: string, enabled: boolean) {
  const userId = useUserId();
  const { from, to } = weekAround(date);
  return useQuery({
    queryKey: ['daily-logs', userId, 'high-days', from],
    enabled,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date')
        .eq('client_id', userId)
        .eq('day_type', 'high')
        .gte('log_date', from)
        .lte('log_date', to);
      if (error) throw error;
      return (data ?? []).map((r) => r.log_date as string);
    },
  });
}

// The member's calorie and macro target for the day being looked at (the same one the food diary and the manual macro diary
// show their totals against), or null when their profile has no targets yet. A calorie-cycling member's high day has the high
// target, every other day the normal (low) one.
export function useFoodTarget(profile: ClientProfileRow | null, today: string, date: string) {
  const weekTarget = useWeekTarget(profile, today);
  const highQ = useHighDays(date, isCyclingTarget(weekTarget));
  const isHigh = !!highQ.data?.includes(date);
  return useMemo(() => dayTargetFor(weekTarget, isHigh ? 'high' : 'flat'), [weekTarget, isHigh]);
}

// Calorie cycling, under the diary's targets: whether `date` is a high day, how many are left that week, and a way to change it.
// `cycling` is false for everyone not on calorie cycling (nothing is shown then).
export function useHighDay(profile: ClientProfileRow | null, today: string, date: string) {
  const userId = useUserId();
  const qc = useQueryClient();
  const weekTarget = useWeekTarget(profile, today);
  const cycling = isCyclingTarget(weekTarget);
  const highQ = useHighDays(date, cycling);
  const others = (highQ.data ?? []).filter((d) => d !== date);
  const isHigh = !!highQ.data?.includes(date);

  const toggle = useMutation({
    mutationFn: async (high: boolean) => {
      // Checked again against the database, in case the week changed on another device.
      const { from, to } = weekAround(date);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date')
        .eq('client_id', userId)
        .eq('day_type', 'high')
        .gte('log_date', from)
        .lte('log_date', to);
      if (error) throw error;
      const taken = (data ?? []).filter((r) => r.log_date !== date).length;
      if (high && taken >= HIGH_DAYS_PER_WEEK) {
        throw new Error(`You already have ${HIGH_DAYS_PER_WEEK} high days this week. Make one of them a normal day first.`);
      }
      const { error: saveError } = await supabase
        .from('daily_logs')
        .upsert({ client_id: userId, log_date: date, day_type: high ? 'high' : 'flat' }, { onConflict: 'client_id,log_date' });
      if (saveError) throw saveError;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['daily-logs', userId] }),
  });

  return {
    cycling,
    isHigh,
    loaded: highQ.isSuccess,
    left: highDaysLeft(others.map(() => 'high' as const)),
    extraCalories: weekTarget?.dailyHigh && weekTarget.dailyLow ? weekTarget.dailyHigh.calories - weekTarget.dailyLow.calories : 0,
    toggle,
  };
}
