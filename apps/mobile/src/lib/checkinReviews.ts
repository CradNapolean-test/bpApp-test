import { useQuery } from '@tanstack/react-query';

import { reviewsByRef, type CheckinReviewRow, type ReviewMark } from '@ballistic/shared/utils/checkinReviews';

import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Which of the member's weeks and forms their coach has reviewed, and who by (D7): "Reviewed by Brad ✓". Read through the narrow
// my_checkin_reviews() function (migration 0170), the same read the web uses. When it cannot be read (no signal on first open, or the
// migration not applied yet) the screens simply show no "Reviewed" line.
export function useCheckinReviews(kind: 'week' | 'form'): Map<string, ReviewMark> {
  const { session } = useSession();
  const userId = session?.user.id ?? '';
  const q = useQuery({
    queryKey: ['checkin-reviews', userId],
    enabled: userId !== '',
    staleTime: 60_000,
    queryFn: async (): Promise<CheckinReviewRow[]> => {
      const { data, error } = await supabase.rpc('my_checkin_reviews');
      if (error) throw error;
      return Array.isArray(data) ? (data as CheckinReviewRow[]) : [];
    },
  });
  return reviewsByRef(q.data, kind);
}
