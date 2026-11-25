// Which days of a photo diary member's meals the coach still has to look at (NU28). One rule for the dashboard's "Meal photos to review"
// and the coach's photo diary, so the two always agree: a day with at least one meal in the last week (today and the seven days before
// it) that the coach has neither marked reviewed (coach_reviews, kind 'diary_day') nor left feedback on (nutrition_feedback, on the day
// or on one of its photos). Looking at a day is not reviewing it (R20).
import { addDays, toIsoDate } from './utils/dates';

export const PHOTO_REVIEW_DAYS = 7;

export interface PhotoDay {
  date: string;
  photos: number;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isIsoDate(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const at = Date.parse(value + 'T00:00:00Z');
  // The date must exist: Date.parse rolls 30 February over into March rather than refusing it.
  return !Number.isNaN(at) && new Date(at).toISOString().slice(0, 10) === value;
}

// The first day the review looks at.
export function photoReviewSince(todayIso: string): string {
  return toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), -PHOTO_REVIEW_DAYS));
}

// The days still to review, oldest first. `todayIso`, when given, also leaves out any day after it.
export function unreviewedPhotoDays(
  days: PhotoDay[],
  reviewed: Iterable<string>,
  fed: Iterable<string>,
  since: string,
  todayIso?: string
): PhotoDay[] {
  const done = new Set<string>([...reviewed, ...fed]);
  const byDate = new Map<string, number>();
  for (const d of days) {
    if (d.photos <= 0 || d.date < since || (todayIso && d.date > todayIso) || done.has(d.date)) continue;
    byDate.set(d.date, (byDate.get(d.date) ?? 0) + d.photos);
  }
  return [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, photos]) => ({ date, photos }));
}

// The day the coach's photo diary opens on: the day asked for (a dashboard link names the day), else the oldest day still to review,
// else today. A day asked for after today is ignored.
export function openingPhotoDay(unreviewed: string[], todayIso: string, requested?: string | null): string {
  if (isIsoDate(requested) && requested <= todayIso) return requested;
  return unreviewed[0] ?? todayIso;
}

// The day "Next to review" goes to: the first one after the day on screen, else the oldest one left (going round), else none.
export function nextUnreviewedDay(unreviewed: string[], current: string): string | null {
  const sorted = [...unreviewed].sort();
  return sorted.find((d) => d > current) ?? sorted.find((d) => d !== current) ?? null;
}
