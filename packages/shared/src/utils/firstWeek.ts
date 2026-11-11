import { daysBetween, isoDateInTz } from './dates';

// D17 (owner, 11 Nov 2026): a "Your first week" checklist on member Home for the first 7 days after onboarding (MX24, MX12): start
// photos, first weigh-in, the intake form (when one is assigned), book a class, say hello to the coach. Each item ticks itself from what
// the member has really done; the card goes when everything is done or the week is over. The web has the same rules in
// lib/firstWeek.ts.

export const FIRST_WEEK_DAYS = 7;

export type FirstWeekKey = 'photos' | 'weigh_in' | 'intake' | 'book' | 'hello';

// What the member has done, read from their own rows.
export interface FirstWeekFacts {
  hasPhotos: boolean; // any progress photo
  hasWeighIn: boolean; // any bodyweight in the daily check-in (or a body scan with a weight)
  intake: { id: string; name: string; done: boolean } | null; // null: no form assigned
  hasBooking: boolean; // any session booked (not a waitlist place, not cancelled)
  saidHello: boolean; // any chat message the member sent
}

export interface FirstWeekItem {
  key: FirstWeekKey;
  title: string;
  detail: string;
  done: boolean;
}

export interface FirstWeek {
  day: number; // 1 to FIRST_WEEK_DAYS
  items: FirstWeekItem[];
  doneCount: number;
}

// Which day of the first week today is (1 = the day onboarding was finished, in the member's own timezone), or null outside it.
export function firstWeekDay(onboardedAt: string | null | undefined, today: string, tz: string): number | null {
  if (!onboardedAt) return null;
  const start = isoDateInTz(new Date(onboardedAt), tz);
  const day = daysBetween(start, today) + 1;
  return day >= 1 && day <= FIRST_WEEK_DAYS ? day : null;
}

// The intake form: the gym's default onboarding form when it is assigned (onboarding assigns it), else the first form assigned.
export function pickIntakeForm<T extends { id: string; assigned_at: string; completed_at: string | null; template: { name: string; is_default_onboarding?: boolean } | null }>(
  assignments: readonly T[]
): { id: string; name: string; done: boolean } | null {
  const usable = assignments.filter((a) => a.template);
  const pick = usable.find((a) => a.template!.is_default_onboarding) ?? [...usable].sort((a, b) => a.assigned_at.localeCompare(b.assigned_at))[0];
  return pick ? { id: pick.id, name: pick.template!.name, done: pick.completed_at != null } : null;
}

// The checklist, or null when it does not show: outside the first week, or everything done. `show` leaves out what the member's plan or
// coach has switched off (photos, the daily check-in, forms).
export function firstWeekChecklist(input: {
  onboardedAt: string | null | undefined;
  today: string;
  tz: string;
  facts: FirstWeekFacts;
  coachName?: string | null;
  show?: { photos?: boolean; weighIn?: boolean; forms?: boolean };
}): FirstWeek | null {
  const day = firstWeekDay(input.onboardedAt, input.today, input.tz);
  if (day == null) return null;
  const { facts } = input;
  const show = { photos: true, weighIn: true, forms: true, ...input.show };
  const coach = input.coachName?.trim() || 'your coach';
  const items: FirstWeekItem[] = [];
  if (show.photos) items.push({ key: 'photos', title: 'Take your start photos', detail: 'Front, side and back, for your before and after', done: facts.hasPhotos });
  if (show.weighIn) items.push({ key: 'weigh_in', title: 'Log your first weigh-in', detail: 'Add your bodyweight in the daily check-in', done: facts.hasWeighIn });
  if (show.forms && facts.intake) items.push({ key: 'intake', title: `Fill in ${facts.intake.name}`, detail: `So ${coach} knows where you are starting from`, done: facts.intake.done });
  items.push({ key: 'book', title: 'Book a class', detail: 'Pick a session on the Book tab', done: facts.hasBooking });
  items.push({ key: 'hello', title: `Say hello to ${coach}`, detail: 'A quick message to introduce yourself', done: facts.saidHello });
  const doneCount = items.filter((i) => i.done).length;
  if (doneCount === items.length) return null;
  return { day, items, doneCount };
}
