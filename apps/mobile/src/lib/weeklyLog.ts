import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';

import type { DailyLogRow } from '@ballistic/shared/data/types';
import { formatClassTime } from '@ballistic/shared/utils/dates';
import { applyDayPatch, blankDailyLog, datesOfWeek, type DayPatch } from '@ballistic/shared/utils/weeklyLog';

import { WRITE_DAY_SAVE, type DaySaveVars } from '@/lib/queuedWrites';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useQueuedWrite } from '@/lib/writeQueue';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// One week of the member's days (7 rows at most). The week picker asks for each week it shows, once.
export function useWeekLogs(weekStart: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['daily-logs', userId, 'week', weekStart],
    enabled,
    queryFn: async (): Promise<DailyLogRow[]> => {
      const dates = datesOfWeek(weekStart);
      const { data, error } = await supabase
        .from('daily_logs')
        .select('*')
        .eq('client_id', userId)
        .gte('log_date', dates[0])
        .lte('log_date', dates[6])
        .order('log_date', { ascending: true });
      if (error) throw error;
      return (data ?? []) as DailyLogRow[];
    },
  });
}

// Sessions the member actually attended in that week (checked in, or marked by the coach): a day with one counts as a
// gym session without ticking anything.
export function useAttendedSessions(weekStart: string, enabled = true) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['bookings', userId, 'attended', weekStart],
    enabled,
    queryFn: async (): Promise<{ date: string; label: string }[]> => {
      const dates = datesOfWeek(weekStart);
      const { data, error } = await supabase
        .from('bookings')
        .select('booking_date, class:classes(name, start_time)')
        .eq('client_id', userId)
        .eq('attended', true)
        .gte('booking_date', dates[0])
        .lte('booking_date', dates[6]);
      if (error) throw error;
      return ((data ?? []) as unknown as { booking_date: string; class: { name: string; start_time: string | null } | { name: string; start_time: string | null }[] | null }[]).map((b) => {
        const cls = Array.isArray(b.class) ? b.class[0] : b.class;
        const time = formatClassTime(cls?.start_time);
        return { date: b.booking_date, label: [cls?.name, time].filter(Boolean).join(' ') || 'Class' };
      });
    },
  });
}

// The dates a period started, for the cycle-day figure (female members only).
export function usePeriodStarts(enabled: boolean) {
  const userId = useUserId();
  return useQuery({
    queryKey: ['daily-logs', userId, 'period-starts'],
    enabled,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase
        .from('daily_logs')
        .select('log_date')
        .eq('client_id', userId)
        .eq('period_started', true)
        .order('log_date', { ascending: false })
        .limit(24);
      if (error) throw error;
      return (data ?? []).map((r) => r.log_date as string);
    },
  });
}

// Saves what the member just changed on one day, and ONLY that: the upsert carries the changed fields, so another figure
// (or the macros the food diary wrote) is never overwritten by an older copy. The week on screen and the recent logs
// (streak, Home, Coach) show the change at once, and the save works with no signal (writeQueue.ts): it waits for a
// connection. If the server refuses it, the screens are refetched and the figure goes back.
export function useSaveDay() {
  const userId = useUserId();
  const qc = useQueryClient();
  const toVars = useCallback((v: { date: string; patch: DayPatch }): DaySaveVars => ({ userId, ...v }), [userId]);
  const apply = useCallback(
    async ({ date, patch }: { date: string; patch: DayPatch }) => {
      await qc.cancelQueries({ queryKey: ['daily-logs', userId] });
      for (const [key, data] of qc.getQueriesData<unknown>({ queryKey: ['daily-logs', userId] })) {
        const kind = key[2];
        if (!Array.isArray(data) || (kind !== 'week' && kind !== 'recent')) continue;
        const rows = data as DailyLogRow[];
        if (kind === 'week' && !datesOfWeek(key[3] as string).includes(date)) continue;
        const has = rows.some((r) => r.log_date === date);
        const next = has
          ? rows.map((r) => (r.log_date === date ? applyDayPatch(r, patch) : r))
          : [...rows, applyDayPatch(blankDailyLog(userId, date), patch)].sort((a, b) => a.log_date.localeCompare(b.log_date));
        qc.setQueryData(key, next);
      }
    },
    [qc, userId],
  );
  return useQueuedWrite({ key: WRITE_DAY_SAVE, toVars, apply });
}
