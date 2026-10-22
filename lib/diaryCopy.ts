import { BROWSE_DAYS, EDIT_DAYS } from './dayPatch';
import { newPlanRows, type DiaryRowKey } from './planLogging';
import { addDays, toIsoDate } from './utils/dates';

// Copying food between days on the Food screen: a whole day, or one meal (into another day, or into another meal).

// What the Copy sheet asks for. `fromSectionId` set means only that meal is copied; `toSectionId` set means everything lands in that
// meal (otherwise each row keeps the meal it was in).
export interface DiaryCopyRequest {
  fromDate: string;
  toDate: string;
  fromSectionId?: string;
  toSectionId?: string;
}

// Today and the days before it, newest first.
function daysBackFrom(todayIso: string, count: number): string[] {
  const today = new Date(`${todayIso}T00:00:00Z`);
  return Array.from({ length: count + 1 }, (_, i) => toIsoDate(addDays(today, -i)));
}

// The days food can be copied INTO: the ones a member may still change.
export const copyTargetDays = (todayIso: string) => daysBackFrom(todayIso, EDIT_DAYS);

// The days food can be copied FROM: the ones a member may look at.
export const copySourceDays = (todayIso: string) => daysBackFrom(todayIso, BROWSE_DAYS);

// "Today", "Yesterday", else "Mon 12 Oct". In a sentence ("copied from yesterday") the first two are lower case.
export function dayLabel(date: string, todayIso: string, inSentence = false): string {
  const age = Math.round((new Date(`${todayIso}T00:00:00Z`).getTime() - new Date(`${date}T00:00:00Z`).getTime()) / 86_400_000);
  if (age === 0) return inSentence ? 'today' : 'Today';
  if (age === 1) return inSentence ? 'yesterday' : 'Yesterday';
  return new Date(`${date}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}

// The rows of `source` that should be written onto the target day: filed into `toSectionId` when given, and leaving out the ones the
// target already has (the same food or Quick Add, in the same meal, in the same amount), so a second tap, or a day copied twice, adds
// nothing instead of doubling everything.
export function rowsToCopy<T extends DiaryRowKey>(source: T[], existing: DiaryRowKey[], toSectionId?: string): T[] {
  const landing = toSectionId === undefined ? source : source.map((row) => ({ ...row, meal_section_id: toSectionId }));
  return newPlanRows(landing, existing);
}

// `where` is what follows the count: "from yesterday", "to Mon 12 Oct".
export function copyMessage(added: number, found: number, where: string): string {
  const items = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  if (added === 0) return found === 1 ? 'That item is already there, so nothing was copied.' : 'All of it is already there, so nothing was copied.';
  if (added < found) return `${added} of ${found} items copied ${where}. The rest were already there.`;
  return `${items(added)} copied ${where}`;
}
