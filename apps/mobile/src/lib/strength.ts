import { useQuery } from '@tanstack/react-query';

import type { WorkoutLogRow } from '@ballistic/shared/data/types';
import { workoutWindowStart } from '@ballistic/shared/utils/trainingWindow';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// A logged set with the name of the exercise it was done for (a log points at a programme exercise row).
export type StrengthLog = WorkoutLogRow & { exercise: { name: string; exercise_library_id: string | null } | null };

export type StrengthData = {
  // The last 90 days of the member's sets, newest first (H5: a bounded read, never the whole history).
  logs: StrengthLog[];
  // The best set per exercise from BEFORE that window (migration 0137), keyed by library id or "n:<name>", so a personal best inside the
  // window is a true one and the headline is the all-time best.
  priorBests: Record<string, { load: number; score: number }>;
};

// Load volume and lift progression for the Strength segment of Progress & results. Two small requests, started together.
export function useStrengthData(todayIso: string, enabled = true) {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['strength', userId],
    enabled: enabled && !!userId,
    staleTime: 2 * 60_000,
    queryFn: async (): Promise<StrengthData> => {
      const windowStart = workoutWindowStart(todayIso);
      const [logsRes, bestsRes] = await Promise.all([
        supabase
          .from('workout_logs')
          .select('*, exercise:workout_exercises(name, exercise_library_id)')
          .eq('client_id', userId!)
          .gte('logged_at', windowStart)
          .order('logged_at', { ascending: false })
          .limit(1000),
        supabase.rpc('member_strength_bests', { p_client: userId!, p_before: windowStart }),
      ]);
      if (logsRes.error) throw logsRes.error;
      // If the bests cannot be read the screen still works; a personal best is then judged against the window alone.
      const priorBests: StrengthData['priorBests'] = {};
      for (const b of (bestsRes.data ?? []) as { exercise_key: string; best_load: number | string; best_score: number | string }[]) {
        priorBests[b.exercise_key] = { load: Number(b.best_load), score: Number(b.best_score) };
      }
      return { logs: (logsRes.data ?? []) as unknown as StrengthLog[], priorBests };
    },
  });
}
