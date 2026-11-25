'use server';

import { createClient } from '@/lib/supabase/server';
import { photoCount } from '@/lib/coachDashboardRules';
import { isIsoDate } from '@/lib/photoReview';
import type { PhotoDay } from '@/lib/photoReview';

// The coach's photo diary of one member (NU28): the days from `since` with meals on them, and the days the coach has marked reviewed.
// With the feedback the page already has, that says which days are still to review (lib/photoReview.ts, the dashboard's own rule).
// Reads only, as the signed-in coach: the database's own rules decide whose rows come back (a member of the coach's gym, 0052/0053,
// and their review marks, 0087), so a coach asking about anyone else gets nothing. `ok` is false when either read fails: the diary
// then marks no days and claims nothing about any day.
export async function getPhotoDiaryReviewDays(clientId: string, since: string): Promise<{ ok: boolean; days: PhotoDay[]; reviewed: string[] }> {
  if (!clientId || !isIsoDate(since)) return { ok: false, days: [], reviewed: [] };
  const supabase = await createClient();
  const [logs, reviews] = await Promise.all([
    supabase.from('daily_logs').select('log_date, food_photo_entries(count)').eq('client_id', clientId).gte('log_date', since),
    supabase.from('coach_reviews').select('ref').eq('client_id', clientId).eq('kind', 'diary_day').gte('ref', since),
  ]);
  if (logs.error || reviews.error) return { ok: false, days: [], reviewed: [] };
  const days = ((logs.data ?? []) as { log_date: string; food_photo_entries: { count: number }[] | null }[])
    .map((l) => ({ date: l.log_date, photos: photoCount(l.food_photo_entries) }))
    .filter((d) => d.photos > 0);
  return { ok: true, days, reviewed: (reviews.data ?? []).map((r) => r.ref as string) };
}
