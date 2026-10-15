import { addDays, isoWeekKey, toIsoDate } from './utils/dates';

// "Needs you" on a member's page only looks at the last two weeks of check-ins and the last 30 days of forms, so a check-in or form
// from before that which nobody reviewed simply stopped being mentioned (MO). This finds those, so the page can say "N older items
// are not reviewed" instead of letting them vanish.

export const CHECKIN_LOOKBACK_WEEKS = 2;
export const FORM_LOOKBACK_DAYS = 30;

export interface OlderUnreviewed {
  // Monday of each older week with something logged and no review, newest first.
  weeks: string[];
  // Ids of completed forms from before the lookback that nobody has marked read.
  forms: string[];
}

export function olderUnreviewed(input: {
  // Days with anything logged (YYYY-MM-DD), from whatever history the page has.
  loggedDates: string[];
  completedForms: { id: string; completedAt: string | null }[];
  reviewedWeeks: string[];
  reviewedForms: string[];
  todayIso: string;
}): OlderUnreviewed {
  const thisWeek = isoWeekKey(input.todayIso);
  // The newest week the page already lists is the one before this; the lookback starts that many weeks back.
  const oldestListedWeek = toIsoDate(addDays(new Date(`${thisWeek}T00:00:00Z`), -7 * CHECKIN_LOOKBACK_WEEKS));
  const weeks = [...new Set(input.loggedDates.map(isoWeekKey))]
    .filter((w) => w < oldestListedWeek && !input.reviewedWeeks.includes(w))
    .sort()
    .reverse();

  const formCutoff = toIsoDate(addDays(new Date(`${input.todayIso}T00:00:00Z`), -FORM_LOOKBACK_DAYS));
  const forms = input.completedForms
    .filter((f) => f.completedAt != null && f.completedAt < formCutoff && !input.reviewedForms.includes(f.id))
    .map((f) => f.id);
  return { weeks, forms };
}

export function olderUnreviewedLine(older: OlderUnreviewed): { title: string; hint: string } | null {
  const n = older.weeks.length + older.forms.length;
  if (n === 0) return null;
  const parts = [
    older.weeks.length > 0 ? `${older.weeks.length} check-in week${older.weeks.length === 1 ? '' : 's'}` : '',
    older.forms.length > 0 ? `${older.forms.length} form${older.forms.length === 1 ? '' : 's'}` : '',
  ].filter(Boolean);
  return {
    title: `${n} older item${n === 1 ? '' : 's'} not reviewed`,
    hint: `${parts.join(' and ')} from before the last ${CHECKIN_LOOKBACK_WEEKS} weeks`,
  };
}
