import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { ActivityRow, ClientProfileRow } from '@ballistic/shared/data/types';
import { validateMinutesPer1000 } from '@ballistic/shared/utils/activity';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// The activity list (about 44 rows, the same for everyone and almost never changed): kept for a day.
export function useActivities() {
  return useQuery({
    queryKey: ['activities'],
    staleTime: 24 * 60 * 60_000,
    queryFn: async (): Promise<ActivityRow[]> => {
      const { data, error } = await supabase.from('activities').select('id, name, met').order('name');
      if (error) throw error;
      return (data ?? []) as ActivityRow[];
    },
  });
}

// Remembers the member's own "minutes per 1,000 steps" on their profile.
export function useSaveMinutesPer1000() {
  const { session } = useSession();
  const userId = session?.user.id;
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (minutes: number) => {
      const problem = validateMinutesPer1000(minutes);
      if (problem) throw new Error(problem);
      const { data, error } = await supabase.from('client_profiles').update({ minutes_per_1000_steps: minutes }).eq('client_id', userId!).select('client_id');
      if (error || !data?.length) throw new Error('Could not save that.');
      return minutes;
    },
    onSuccess: (minutes) => {
      qc.setQueryData<ClientProfileRow | null>(['client-profile', userId], (p) => (p ? { ...p, minutes_per_1000_steps: minutes } : p));
    },
  });
}
