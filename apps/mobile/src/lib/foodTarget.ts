import { useMemo } from 'react';

import { weeklyTarget } from '@ballistic/shared/calculations';
import type { ClientProfileRow } from '@ballistic/shared/data/types';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import { dayTargetFor } from '@ballistic/shared/utils/dayTarget';
import { programWeekFromLogs } from '@ballistic/shared/utils/streak';

import { useRecentLogs } from '@/lib/today';

// The member's calorie and macro target for the day being looked at (the same one the food diary and the manual macro diary
// show their totals against), or null when their profile has no targets yet.
export function useFoodTarget(profile: ClientProfileRow | null, today: string, date: string) {
  const logsQ = useRecentLogs(today, !!profile);
  const logs = useMemo(() => logsQ.data ?? [], [logsQ.data]);
  const viewLog = logs.find((l) => l.log_date === date);
  return useMemo(() => {
    const engine = toMemberEngineProfile(profile, false); // none while the plan waits for the coach (M8, D6)
    return dayTargetFor(engine ? weeklyTarget(engine, programWeekFromLogs(logs, today)) : null, viewLog?.day_type);
  }, [profile, logs, today, viewLog?.day_type]);
}
