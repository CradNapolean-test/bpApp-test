// The words around "Start this programme" (R5). Starting a programme replaces every chosen member's current programme, so the sheet defaults to
// "Choose members", shows the real number of people, and asks for a confirmation when the whole gym is picked. Kept as plain functions so the
// wording and the numbers can be tested.
export type RolloutAudience = 'all' | 'selected';

export interface RolloutPlan {
  audience: RolloutAudience;
  // How many members it reaches: the chosen members, or everyone at the gym. null while the gym's number is still loading.
  memberCount: number | null;
  // True when the start date is today or earlier (the programme is given out straight away rather than by the overnight job).
  startsNow: boolean;
  // The start date written out, for example "Mon 2 Nov".
  startLabel: string;
}

export const DEFAULT_ROLLOUT_AUDIENCE: RolloutAudience = 'selected';

export function membersLabel(count: number): string {
  return `${count} member${count === 1 ? '' : 's'}`;
}

export function rolloutButtonLabel(plan: RolloutPlan): string {
  const { audience, memberCount, startsNow, startLabel } = plan;
  if (audience === 'selected' && !memberCount) return 'Choose who gets it';
  const who = memberCount == null ? 'everyone' : audience === 'all' ? `all ${membersLabel(memberCount)}` : membersLabel(memberCount);
  return startsNow ? `Start for ${who} today` : `Schedule for ${who} on ${startLabel}`;
}

export interface RolloutConfirmation {
  title: string;
  body: string;
  confirmLabel: string;
}

// Only the whole-gym choice needs a confirmation; a handful of picked members is already deliberate and the button shows the count.
export function rolloutConfirmation(plan: RolloutPlan): RolloutConfirmation | null {
  if (plan.audience !== 'all') return null;
  const who = plan.memberCount == null ? 'everyone at the gym' : membersLabel(plan.memberCount);
  const keep = 'Their old programmes and every weight and rep logged stay on file.';
  return {
    title: 'Start this programme for everyone?',
    body: plan.startsNow
      ? `This will replace the current programme for ${who} today. ${keep}`
      : `On ${plan.startLabel} this will replace the current programme for ${who}. ${keep}`,
    confirmLabel: plan.startsNow ? `Start for ${who}` : `Schedule for ${who}`,
  };
}

export function rolloutSuccessMessage(plan: Pick<RolloutPlan, 'startsNow' | 'startLabel'>, count: number): string {
  return plan.startsNow ? `Started for ${membersLabel(count)}` : `Scheduled for ${membersLabel(count)} on ${plan.startLabel}`;
}
