import { useQuery } from '@tanstack/react-query';

import { ongoingPlans, type PlanOption } from '@ballistic/shared/utils/challengeHome';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// "Sessions done" on Home: bookings the member actually attended (checked in, or marked by the coach afterwards),
// counted by the database so no rows come down the wire.
export function useSessionsDone() {
  const { session } = useSession();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['sessions-done', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('bookings')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', userId!)
        .eq('attended', true);
      if (error) throw error;
      return count ?? 0;
    },
  });
}

// The gym's ongoing plans (no set length), for the "What's next" card in a challenge's last 2 weeks (D5). Read under RLS: a member may
// read their own gym's plans. Only asked for while the card shows.
export function useOngoingPlans(gymId: string | null | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['ongoing-plans', gymId],
    enabled: enabled && !!gymId,
    staleTime: 30 * 60_000,
    queryFn: async (): Promise<PlanOption[]> => {
      const { data, error } = await supabase.from('membership_packages').select('id, name, credits_per_week, duration_weeks').eq('gym_id', gymId!);
      if (error) throw error;
      return ongoingPlans((data ?? []) as PlanOption[]);
    },
  });
}
