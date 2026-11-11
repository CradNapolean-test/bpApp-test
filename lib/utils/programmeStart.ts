// Starting a programme for a member, or rolling one out (CW17).
import { addDays, toIsoDate } from './dates';

// Programme weeks run Monday to Sunday ("started Mon 19 Oct"), so a new programme starts on the coming Monday, or today when today is a
// Monday. The Start sheet used to default to today, a Friday, which put the member's weeks Friday to Thursday.
export function nextProgrammeStart(todayIso: string): string {
  const today = new Date(`${todayIso}T00:00:00Z`);
  return toIsoDate(addDays(today, (8 - today.getUTCDay()) % 7));
}

// Templates made to try the builder out ("Test", "test 2") are not offered when starting a member on one. Only those exact names: a real
// template such as "Testosterone block" or "Test week" stays. Deleting them in Library is the lasting fix (LB14).
export function isTestTemplateName(name: string): boolean {
  return /^\s*test\s*\d*\s*$/i.test(name);
}
