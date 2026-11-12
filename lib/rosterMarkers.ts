import type { RosterEntry } from '@/lib/data/types';

// The chips under a member's name on the day (CS4): first class (or new member), a plan on hold, too few credits for their next
// session, and an injury on their journal. Health and injury text is shown by the component, not here.
export function rosterMarkerChips(entry: RosterEntry, creditCost: number): { label: string; tone: 'accent' | 'warning' | 'danger' }[] {
  const out: { label: string; tone: 'accent' | 'warning' | 'danger' }[] = [];
  if (entry.firstClass) out.push({ label: 'First class', tone: 'accent' });
  else if (entry.newMember) out.push({ label: 'New member', tone: 'accent' });
  if (entry.onHold) out.push({ label: 'Plan on hold', tone: 'warning' });
  if (entry.credits != null && entry.credits < creditCost) out.push({ label: `${entry.credits} credit${entry.credits === 1 ? '' : 's'} left`, tone: 'danger' });
  if ((entry.injuryNotes?.length ?? 0) > 0) out.push({ label: 'Injury', tone: 'danger' });
  return out;
}
