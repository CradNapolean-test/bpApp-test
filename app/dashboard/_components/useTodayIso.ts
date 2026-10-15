'use client';

import { useEffect, useState } from 'react';
import { msUntilNextMidnight } from '@/lib/midnight';
import { todayIsoInTz } from '@/lib/utils/dates';

// Today's date in a timezone, kept current (FT2). Screens used to work "today" out once when they opened, so a phone left open overnight
// went on logging new food against yesterday. This moves to the new day at midnight in that timezone, and again whenever the app comes
// back to the foreground (a phone's timers pause while it is asleep).
export function useTodayIso(timezone: string): string {
  const [today, setToday] = useState(() => todayIsoInTz(timezone));

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      // A second past midnight, so the new date is certainly the new date; never a busy loop if the clock is odd.
      timer = setTimeout(check, Math.max(1000, msUntilNextMidnight(timezone)) + 1000);
    };
    const check = () => {
      setToday(todayIsoInTz(timezone));
      schedule();
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    schedule();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [timezone]);

  return today;
}
