// The owner's "Staff activity" list (SE23): one sentence per thing a coach, a gym admin or the owner did to the team, from
// owner_staff_activity (migration 0176). Pure, so the wording can be tested.

import { prettyName } from '@/lib/gymNames';

export type StaffAction = 'coach_added' | 'coach_removed' | 'members_moved' | 'member_coach_changed' | 'admin_on' | 'admin_off' | 'login_on';

export interface StaffActivityRow {
  key: string;
  at: string;
  action: StaffAction | string;
  gymId: string;
  gymName: string | null;
  // Display name or login address; null when the database couldn't tell who (the app's server, the SQL editor) or the account is gone.
  actorName: string | null;
  actorIsYou: boolean;
  coachName: string | null;
  toCoachName: string | null;
  memberName: string | null;
  memberCount: number | null;
}

export interface StaffActivityPage {
  total: number;
  limit: number;
  offset: number;
  rows: StaffActivityRow[];
}

export const STAFF_PAGE_SIZE = 20;

const person = (name: string | null, gone = 'a deleted account') => (name ? prettyName(name) : gone);

// "You moved 3 members from Brad to Adam", "Adam changed Jo Bloggs's coach from Brad to Quays", "Brad's login was switched back on".
export function describeStaffActivity(row: StaffActivityRow): string {
  const who = row.actorIsYou ? 'You' : row.actorName ? prettyName(row.actorName) : null;
  const coach = person(row.coachName);
  const to = person(row.toCoachName);
  switch (row.action) {
    case 'coach_added':
      return who ? `${who} added ${coach} to the gym` : `${coach} was added to the gym`;
    case 'coach_removed':
      return who ? `${who} removed ${coach} from the gym` : `${coach} was removed from the gym`;
    case 'members_moved': {
      const n = row.memberCount ?? 0;
      const what = `${n} member${n === 1 ? '' : 's'} from ${coach} to ${to}`;
      return who ? `${who} moved ${what}` : `${what} were moved`;
    }
    case 'member_coach_changed': {
      const member = person(row.memberName, 'a deleted member');
      const from = row.coachName ? prettyName(row.coachName) : 'no coach';
      return who ? `${who} changed ${member}'s coach from ${from} to ${to}` : `${member}'s coach was changed from ${from} to ${to}`;
    }
    case 'admin_on':
      return who ? `${who} made ${coach} a gym admin` : `${coach} was made a gym admin`;
    case 'admin_off':
      return who ? `${who} took gym admin off ${coach}` : `Gym admin was taken off ${coach}`;
    case 'login_on':
      return who ? `${who} switched ${coach}'s login back on` : `${coach}'s login was switched back on`;
    default:
      return who ? `${who} changed the team` : 'The team was changed';
  }
}
