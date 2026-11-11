import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { weeklyTarget } from '@ballistic/shared/calculations';
import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import { averageDayTarget, dayTargetFor, highDayProblem, highDaysLeft, highDayWeek, isCyclingTarget } from '@ballistic/shared/utils/dayTarget';
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

function useWeekTarget(profile: ClientProfileRow | null, today: string) {
  const logsQ = useRecentLogs(today, !!profile);
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  return useMemo(() => {
    const engine = toMemberEngineProfile(profile, false); // none while the plan waits for the coach (M8, D6)
    return engine ? weeklyTarget(engine, programWeekFromLogs(logs, today)) : null;
  }, [profile, logs, today]);
}

// Calorie cycling: the days of `date`'s week (highDayWeek, shared with the web) the member made high days. Read for the screen and
// again just before a change.
async function fetchHighDays(userId: string, date: string): Promise<string[]> {
  const { from, to } = highDayWeek(date);
  const { data, error } = await supabase
    .from('daily_logs')
    .select('log_date')
    .eq('client_id', userId)
    .eq('day_type', 'high')
    .gte('log_date', from)
    .lte('log_date', to);
  if (error) throw error;
  return (data ?? []).map((r) => r.log_date as string);
}

// Under the ['daily-logs', userId] key, so any daily log change marks it stale.
function useHighDays(date: string, enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['daily-logs', userId, 'high-days', highDayWeek(date).from],
    enabled,
    queryFn: () => fetchHighDays(userId, date),
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

// The member's targets as an average day (the week over seven; the flat target when not calorie cycling): what "Set my own targets"
// starts from, since a member's own targets are the same every day.
export function useAverageFoodTarget(profile: ClientProfileRow | null, today: string) {
  const weekTarget = useWeekTarget(profile, today);
  return useMemo(() => averageDayTarget(weekTarget), [weekTarget]);
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
      const taken = (await fetchHighDays(userId, date)).filter((d) => d !== date).length;
      const problem = highDayProblem(taken, high);
      if (problem) throw new Error(problem);
      // As the web's setHighDay: back to a normal day only changes a row the day already has (no row is already a normal day, and
      // used to get an empty one); a high day needs its row, so it is made then if the day has none.
      const { error: saveError } = high
        ? await supabase.from('daily_logs').upsert({ client_id: userId, log_date: date, day_type: 'high' }, { onConflict: 'client_id,log_date' })
        : await supabase.from('daily_logs').update({ day_type: 'flat' }).eq('client_id', userId).eq('log_date', date);
      if (saveError) throw saveError;
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['daily-logs', userId] }),
  });

  return {
    cycling,
    isHigh,
    // A failed background refresh keeps the week it already had (react-query keeps the data), so only a week never read is "failed".
    loaded: highQ.data !== undefined,
    // The week's high days could not be read: the row says so with a way to try again, instead of a button that never wakes up.
    failed: highQ.isError && highQ.data === undefined,
    retry: () => void highQ.refetch(),
    left: highDaysLeft(others.map(() => 'high' as const)),
    extraCalories: weekTarget?.dailyHigh && weekTarget.dailyLow ? weekTarget.dailyHigh.calories - weekTarget.dailyLow.calories : 0,
    toggle,
  };
}
