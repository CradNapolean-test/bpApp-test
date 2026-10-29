import { useMemo } from 'react';

import { weeklyTarget } from '@ballistic/shared/calculations';
import { targetsHeldBack } from '@ballistic/shared/onboarding';
import { enabledTrackers } from '@ballistic/shared/utils/checkinMetrics';
import { toMemberEngineProfile } from '@ballistic/shared/utils/clientProfile';
import { dayTargetFor } from '@ballistic/shared/utils/dayTarget';
import { isoDateInTz } from '@ballistic/shared/utils/dates';
import { currentStreak, programWeekFromLogs } from '@ballistic/shared/utils/streak';

import { useDisabledMetrics } from '@/lib/screens';
import { timezoneOf, useClientProfile, useNow, useRecentLogs } from '@/lib/today';

// What Home and the Coach hub both need to know about "today": the member's profile (its timezone decides the date),
// today's log, today's nutrition target and the streak. Both screens call this; the queries behind it are shared and
// cached, so moving between the tabs costs no extra requests.
export function useDayContext() {
  const now = useNow();
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;
  const tz = timezoneOf(profile);
  const todayIso = isoDateInTz(now, tz);
  const ready = !!profile;
  const logsQ = useRecentLogs(todayIso, ready);

  const logs = logsQ.data ?? [];
  const todayLog = logs.find((l) => l.log_date === todayIso);
  const programWeek = programWeekFromLogs(logs, todayIso);
  const target = useMemo(() => {
    // No target while the member's plan is waiting for their coach to look at it (M8, D6).
    const engine = toMemberEngineProfile(profile, false);
    return dayTargetFor(engine ? weeklyTarget(engine, programWeek) : null, todayLog?.day_type);
  }, [profile, programWeek, todayLog?.day_type]);
  const streak = currentStreak(logs, todayIso);
  // Sleep, steps and water are the daily check-in: how many of the ones this member's coach has left on are in for today.
  const disabledMetrics = useDisabledMetrics();
  const trackers = enabledTrackers(disabledMetrics);
  const checkinTotal = trackers.length;
  const checkinDone = trackers.filter((k) => (todayLog?.[k as 'sleep' | 'steps' | 'water'] ?? null) != null).length;

  const targetHeld = targetsHeldBack(profile, false);

  return { now, profileQ, profile, tz, todayIso, ready, logsQ, logs, todayLog, target, targetHeld, streak, checkinDone, checkinTotal, programWeek };
}
