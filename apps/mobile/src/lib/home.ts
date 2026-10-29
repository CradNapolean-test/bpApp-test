import { useQuery } from '@tanstack/react-query';

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
