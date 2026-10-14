import { personaliseMessage } from './broadcastMessages';

// True when `dob` (YYYY-MM-DD) falls on `todayIso` (YYYY-MM-DD, the member's own local date).
// A 29 Feb birthday is celebrated on 28 Feb in years that have no 29 Feb.
export function isBirthdayToday(dob: string | null | undefined, todayIso: string): boolean {
  if (!dob || !/^\d{4}-\d{2}-\d{2}$/.test(dob)) return false;
  const md = dob.slice(5);
  const today = todayIso.slice(5);
  if (md === today) return true;
  if (md === '02-29' && today === '02-28') {
    const y = Number(todayIso.slice(0, 4));
    const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
    return !leap;
  }
  return false;
}

export const BIRTHDAY_SUBJECT = 'Happy birthday from Ballistic Performance';

// {first name} is filled in per member (see personaliseMessage).
export const BIRTHDAY_MESSAGE =
  "Happy birthday {first name}!\n\nEveryone at Ballistic Performance is thinking of you today. Enjoy your day, and we'll see you in the gym soon.\n\nYour coaches";

export function birthdayMessage(fullName: string | null | undefined): string {
  return personaliseMessage(BIRTHDAY_MESSAGE, fullName);
}
