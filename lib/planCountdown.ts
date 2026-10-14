import { daysBetween } from './utils/dates';

export interface PlanCountdown {
  state: 'upcoming' | 'active' | 'ended';
  startsOn: string;
  endsOn: string | null;
  totalWeeks: number | null; // null = ongoing plan
  week: number | null; // 1-based, capped at totalWeeks; null before the start or on an ongoing plan
  daysToStart: number | null; // upcoming only
  daysLeft: number | null; // whole days until the planned last day (0 = last day is today)
  lastWeek: boolean;
}

// Where a member is in a fixed-length plan such as the 6 week challenge. `today` is the member's own
// local date (see todayIsoInTz), so a late-night check does not flip the week early or late.
export function planCountdown(
  m: { started_at: string; scheduled_end?: string | null; ended_at?: string | null; durationWeeks: number | null },
  today: string
): PlanCountdown {
  const total = m.durationWeeks != null && m.durationWeeks > 0 ? m.durationWeeks : null;
  const endsOn = m.scheduled_end ?? (m.ended_at ? m.ended_at.slice(0, 10) : null);
  const base = { startsOn: m.started_at, endsOn, totalWeeks: total };
  if (m.started_at > today) {
    return { ...base, state: 'upcoming', week: null, daysToStart: daysBetween(today, m.started_at), daysLeft: null, lastWeek: false };
  }
  if (endsOn && today > endsOn) {
    return { ...base, state: 'ended', week: total, daysToStart: null, daysLeft: null, lastWeek: false };
  }
  const week = total ? Math.min(Math.floor(daysBetween(m.started_at, today) / 7) + 1, total) : null;
  const daysLeft = endsOn ? daysBetween(today, endsOn) : null;
  return { ...base, state: 'active', week, daysToStart: null, daysLeft, lastWeek: total != null && week === total };
}

// "6 Week Challenge · week 2 of 6 · ends 15 Nov". `fmt` formats an ISO date for display.
export function planCountdownLabel(name: string, c: PlanCountdown, fmt: (iso: string) => string): string {
  const parts = [name];
  if (c.state === 'upcoming') {
    parts.push(`starts ${fmt(c.startsOn)}`);
  } else if (c.state === 'ended') {
    parts.push(c.endsOn ? `ended ${fmt(c.endsOn)}` : 'ended');
  } else {
    if (c.totalWeeks && c.week) parts.push(c.lastWeek ? `final week (${c.week} of ${c.totalWeeks})` : `week ${c.week} of ${c.totalWeeks}`);
    if (c.endsOn) parts.push(`ends ${fmt(c.endsOn)}`);
  }
  return parts.join(' · ');
}
