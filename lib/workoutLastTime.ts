import { hasRecordedValue, setSummary, type LogValues, type TrackingType } from './workoutTracking';

// Last time's numbers show one way in a workout (TR17): the set boxes start from them, and one small line under the set's heading says
// what they were for this set, e.g. "Last week, 12 Nov: 8 × 60kg". They used to show three ways (a row of chips, a "Last" pill and
// the prefilled boxes).
export function lastTimeLine(opts: {
  // "Last week" or "Last time".
  label: string;
  // "12 Nov".
  date: string;
  // What the member did for this set number in their previous session of the exercise (or that session's last set).
  set: LogValues | null;
  tracking: TrackingType;
}): string | null {
  const { label, date, set, tracking } = opts;
  // A tick-only exercise has no numbers to beat.
  if (!set || tracking === 'tick' || !hasRecordedValue(tracking, set)) return null;
  return `${label}, ${date}: ${setText(tracking, set)}`;
}

function setText(tracking: TrackingType, set: LogValues): string {
  if (tracking !== 'weight_reps') return setSummary(tracking, set);
  // No weight (or 0 kg): just the reps.
  if (!set.actual_load) return set.actual_reps == null ? setSummary(tracking, set) : `${set.actual_reps} reps`;
  return `${set.actual_reps ?? '—'} × ${set.actual_load}kg`;
}
