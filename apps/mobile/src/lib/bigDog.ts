import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { EXERCISES, formatResult, levelForResult, type BigDogGender } from '@ballistic/shared/bigDog';
import type { BigDogResultRow } from '@ballistic/shared/data/types';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

function useUserId() {
  const { session } = useSession();
  const id = session?.user.id;
  if (!id) throw new Error('Signed-in screens need a session');
  return id;
}

// The member's scores (verified by the coach and their own self-reported ones), newest first.
export function useBigDogResults() {
  const userId = useUserId();
  return useQuery({
    queryKey: ['big-dog', userId],
    queryFn: async (): Promise<BigDogResultRow[]> => {
      const { data, error } = await supabase
        .from('big_dog_results')
        .select('*')
        .eq('client_id', userId)
        .order('tested_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) {
        // Postgres "undefined table": a database without migration 0063 has no Big Dog table, so show it empty.
        if (error.code === '42P01' || error.code === 'PGRST205') return [];
        throw error;
      }
      return (data ?? []) as BigDogResultRow[];
    },
  });
}

// Logging a score. The level is worked out here from the number and the member's sex, never picked by hand, and the row is
// always marked self-reported: it shows on the member's own screen but only counts towards a T-shirt once a coach verifies it
// (the database only lets a member write self-reported rows).
export function useLogScore(gender: BigDogGender) {
  const userId = useUserId();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ exerciseKey, value }: { exerciseKey: string; value: number }) => {
      const exercise = EXERCISES.find((e) => e.key === exerciseKey);
      if (!exercise) throw new Error('Unknown exercise.');
      if (!Number.isFinite(value) || value < 0 || value > 100000) throw new Error('That result is not valid.');
      const { error } = await supabase.from('big_dog_results').insert({
        client_id: userId,
        exercise_key: exerciseKey,
        level: levelForResult(exercise, gender, value),
        result_value: value,
        result_text: formatResult(exercise.kind, value),
        self_reported: true,
      });
      if (error) throw new Error('Could not save that score.');
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['big-dog', userId] }),
  });
}

export function useDeleteScore() {
  const userId = useUserId();
  const qc = useQueryClient();
  const key = ['big-dog', userId];
  return useMutation({
    mutationFn: async ({ id }: { id: string }) => {
      const { error } = await supabase.from('big_dog_results').delete().eq('id', id).eq('self_reported', true);
      if (error) throw new Error('Could not delete that score.');
    },
    onMutate: async ({ id }) => {
      await qc.cancelQueries({ queryKey: key });
      const previous = qc.getQueryData<BigDogResultRow[]>(key);
      qc.setQueryData<BigDogResultRow[]>(key, (rows = []) => rows.filter((r) => r.id !== id));
      return { previous };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.previous) qc.setQueryData(key, ctx.previous);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: key }),
  });
}
