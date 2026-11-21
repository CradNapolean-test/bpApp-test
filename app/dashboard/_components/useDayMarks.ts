'use client';

import { useEffect, useState } from 'react';
import { getDayMarks, type DayMarkRow } from '@/lib/data/dailyLogs';
import { addDays, toIsoDate } from '@/lib/utils/dates';
import { olderSpan, reachBackDays } from '@/lib/utils/dayStrip';

// A coach's view of a member has no 30-day limit on the day strips (item 8). The page already carries the member's last 84 days
// (dashboardBundle's HISTORY_DAYS), so the coach's strip opens on those with no extra query, and an "Earlier" button at its left end
// adds four weeks at a time: one range query (lib/data/dailyLogs.ts getDayMarks, only the columns the strip reads) for the days
// older than the page's, never one per day.
export const PAGE_HISTORY_DAYS = 84;
export const EARLIER_STEP_DAYS = 28;

const shift = (iso: string, n: number) => toIsoDate(addDays(new Date(`${iso}T00:00:00Z`), n));

export function useOlderDayMarks(clientId: string, todayIso: string, enabled: boolean, reachBackTo?: string | null) {
  const pageFrom = shift(todayIso, -PAGE_HISTORY_DAYS);
  // How many days past the page's 84 the strip reaches. A week opened straight from the coach's dashboard can be older than the
  // page's days, so the strip reaches back to it from the start.
  const [extra, setExtra] = useState(() => (enabled ? reachBackDays(pageFrom, reachBackTo) : 0));
  const [loaded, setLoaded] = useState<{ extra: number; rows: DayMarkRow[] } | null>(null);
  const [failedAt, setFailedAt] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!enabled || extra === 0) return;
    let live = true;
    const span = olderSpan(pageFrom, extra);
    getDayMarks(clientId, span.from, span.to)
      .then((rows) => {
        if (live) setLoaded({ extra, rows });
      })
      .catch(() => {
        if (live) setFailedAt(extra);
      });
    return () => {
      live = false;
    };
  }, [enabled, clientId, pageFrom, extra, attempt]);

  const loadedExtra = loaded?.extra ?? 0;
  const failed = failedAt === extra && loadedExtra !== extra;
  return {
    // The first day on the strip: only days whose rings have arrived are added.
    from: olderSpan(pageFrom, loadedExtra).from,
    older: loaded?.rows ?? [],
    loading: enabled && extra > 0 && loadedExtra !== extra && !failed,
    failed,
    loadEarlier: () => {
      if (failed) {
        setFailedAt(null);
        setAttempt((n) => n + 1);
      } else if (loadedExtra === extra) {
        setExtra(extra + EARLIER_STEP_DAYS);
      }
    },
  };
}
