// "Change coach" for one member (BO14). The database decides who may (change_member_coach, migration 0176: the owner of the member's gym or
// a gym admin there, and only to a coach who works at that gym); these are the screen's own checks and words, kept here so they can be
// tested. Same consequences as "Move members...", so the confirm says the same.

export interface CoachChangeInput {
  memberId: string;
  fromCoachId: string | null;
  toCoachId: string;
}

// Why the change can't be sent as it stands, or null when it can.
export function coachChangeProblem(input: CoachChangeInput): string | null {
  if (!input.memberId) return 'Choose a member.';
  if (!input.toCoachId) return 'Choose the new coach.';
  if (input.toCoachId === input.fromCoachId) return 'That is already their coach.';
  return null;
}

// The coaches a member can be given: the gym's coaches (the list the screen has is the member's own gym's), without their current one.
export function newCoachOptions<T extends { id: string }>(gymCoaches: T[], currentCoachId: string | null): T[] {
  return gymCoaches.filter((c) => c.id !== currentCoachId);
}

// The confirm names the member, the coach they have now and the one they get.
export function changeCoachConfirm(names: { member: string; from: string | null; to: string }): { title: string; body: string; confirmLabel: string } {
  const from = names.from ?? 'no coach';
  return {
    title: `Change ${names.member}'s coach from ${from} to ${names.to}?`,
    body: `${names.to} becomes their coach straight away and gets their chat, check-ins and programmes${
      names.from ? `; ${names.from} loses them` : ''
    }. Open red flags move too. ${names.member} is not told automatically, so message them if you want them to know.`,
    confirmLabel: 'Change coach',
  };
}
