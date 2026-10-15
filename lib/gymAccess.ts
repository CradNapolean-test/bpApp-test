// Who may change a gym's team, and when a coach's login may be switched off (CH1). Kept as plain functions so the rules can be tested; the
// routes feed them what they read through the caller's own session and the admin client.

export interface GymManagerFacts {
  role: string | null;
  // The caller's organisation (owners only) and the organisation the gym belongs to.
  myOrganisationId: string | null;
  gymOrganisationId: string | null;
  // The caller has a membership row at this gym with the admin flag.
  isAdminOfGym: boolean;
}

// A gym admin of that gym, or the owner of the organisation the gym belongs to. Nobody else, whatever they send.
export function mayManageGym(facts: GymManagerFacts): boolean {
  if (facts.role === 'owner') return !!facts.myOrganisationId && facts.myOrganisationId === facts.gymOrganisationId;
  if (facts.role === 'coach') return facts.isAdminOfGym === true;
  return false;
}

export interface CoachFacts {
  role: string | null;
  // profiles.deactivated_at, set by remove_coach_from_gym when the coach has no gym left.
  deactivatedAt: string | null;
  // Gyms the coach still works at.
  gymCount: number;
}

export type LoginChange = { ok: true } | { ok: false; error: string };

// A login is switched off only for a coach the database has already marked as having no gym left. This stops a request that names any
// other account (an active coach, a member, an owner) from banning it.
export function mayDisableLogin(coach: CoachFacts, callerId: string, coachId: string): LoginChange {
  if (callerId === coachId) return { ok: false, error: 'You cannot switch off your own login.' };
  if (coach.role !== 'coach') return { ok: false, error: 'That account is not a coach.' };
  if (coach.gymCount > 0) return { ok: false, error: 'This coach still works at a gym. Remove them from every gym first.' };
  if (!coach.deactivatedAt) return { ok: false, error: 'This coach has not been removed from their gym yet.' };
  return { ok: true };
}

// Switching a login back on is only for a coach who was switched off.
export function mayEnableLogin(coach: CoachFacts): LoginChange {
  if (coach.role !== 'coach') return { ok: false, error: 'That account is not a coach.' };
  if (!coach.deactivatedAt) return { ok: false, error: 'That login is not switched off.' };
  return { ok: true };
}

export interface ResetLinkFacts {
  callerId: string;
  // The caller is a gym admin of the member's gym.
  callerIsAdminOfMemberGym: boolean;
  member: { role: string | null; coachId: string | null };
}

// Who may make a password link for a member (CL6): their own coach, or an admin of their gym. The link lets whoever holds it sign in as that
// member, so it is not offered to every coach at the gym.
export function mayMakeResetLink(facts: ResetLinkFacts): boolean {
  if (facts.member.role !== 'client') return false;
  return facts.member.coachId === facts.callerId || facts.callerIsAdminOfMemberGym === true;
}

// About 100 years: Supabase has no "forever", and 'none' lifts the ban.
export const LOGIN_OFF = '876000h';
export const LOGIN_ON = 'none';
