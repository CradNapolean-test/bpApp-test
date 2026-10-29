import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { toDisabledMetricSet, type CheckinMetric } from '@ballistic/shared/utils/checkinMetrics';
import { memberAreas, tierScreens, toEffectiveDisabledScreenSet, type MemberAreas } from '@ballistic/shared/utils/screens';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useClientProfile, useCredits } from '@/lib/today';

// Which parts of the app this member may see: what their coach switched off for them, narrowed by what their
// membership tier includes. Until both are known everything shows, so a tab never appears and then vanishes on a
// phone that already has them saved; the saved copy covers every launch after the first.
export function useScreenAccess(): { areas: MemberAreas; ready: boolean } {
  const { session } = useSession();
  const userId = session?.user.id;
  const credits = useCredits();
  const profile = useClientProfile();
  const disabledQ = useQuery({
    queryKey: ['disabled-screens', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('client_disabled_screens').select('screen').eq('client_id', userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.screen as string);
    },
  });

  const areas = useMemo(
    () =>
      memberAreas(
        toEffectiveDisabledScreenSet(disabledQ.data ?? [], tierScreens(credits.data?.membership)),
        profile.data?.nutrition_tracking_mode ?? 'full_tracking',
      ),
    [disabledQ.data, credits.data?.membership, profile.data?.nutrition_tracking_mode],
  );
  return { areas, ready: disabledQ.isSuccess && credits.isSuccess };
}

// The daily check-in measures this member's coach has switched off (client_disabled_metrics, migration 0121): sleep, steps, water,
// hunger, energy, motivation, stress. The member can read their own rows. Until it is known nothing is hidden, so a measure never
// appears and then vanishes on a phone that already has the answer saved.
export function useDisabledMetrics(): Set<CheckinMetric> {
  const { session } = useSession();
  const userId = session?.user.id;
  const q = useQuery({
    queryKey: ['disabled-metrics', userId],
    enabled: !!userId,
    staleTime: 5 * 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('client_disabled_metrics').select('metric').eq('client_id', userId!);
      if (error) throw error;
      return (data ?? []).map((r) => r.metric as string);
    },
  });
  return useMemo(() => toDisabledMetricSet(q.data ?? []), [q.data]);
}
