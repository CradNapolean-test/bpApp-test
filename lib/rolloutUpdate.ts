// D8 (LB1, TR18): the words around "Apply to everyone on this rollout". A fix made to a template after it was given out used to reach nobody;
// now the coach can copy the template into everyone's copy on a rollout, for the weeks they haven't reached yet (migration 0167,
// apply_template_to_rollout). Kept as plain functions so the wording and the numbers can be tested.
import { membersLabel } from './rolloutPlan';

export interface RolloutUpdateCounts {
  // Members whose copy changes (has a week still to come).
  members: number;
  // Workouts deleted from those weeks, and workouts copied in from the template.
  daysRemoved: number;
  daysAdded: number;
  // Workouts in those weeks a member has already done something on, left as they are.
  daysKept: number;
}

// "In use by 17 members" on a template, from its rollouts that members are still on. null when nobody is on it.
export function templateInUseLabel(rollouts: { members: number }[]): string | null {
  const total = rollouts.reduce((n, r) => n + r.members, 0);
  return total > 0 ? `In use by ${membersLabel(total)}` : null;
}

const workouts = (n: number) => `${n} workout${n === 1 ? '' : 's'}`;

// The confirm before applying, or null when there is nothing to change (everyone on it is in their last week).
export function rolloutUpdateConfirmation(
  programName: string,
  counts: RolloutUpdateCounts
): { title: string; body: string; confirmLabel: string } | null {
  if (counts.members <= 0) return null;
  const kept =
    counts.daysKept > 0 ? ` ${workouts(counts.daysKept)} a member has already started ${counts.daysKept === 1 ? 'is' : 'are'} kept as ${counts.daysKept === 1 ? 'it is' : 'they are'}.` : '';
  return {
    title: `Apply your changes to ${membersLabel(counts.members)}?`,
    body:
      `Copies “${programName}” as it is now into the weeks ${counts.members === 1 ? 'this member hasn’t' : 'these members haven’t'} reached yet ` +
      `(${workouts(counts.daysAdded)}, replacing ${counts.daysRemoved}). This week and earlier weeks don’t change.${kept} ` +
      `Anything you changed on one member’s copy in those weeks is replaced.`,
    confirmLabel: `Apply to ${membersLabel(counts.members)}`,
  };
}

export const NOTHING_TO_UPDATE = 'Nothing to change: everyone on it is in their last week or has finished.';

export function rolloutUpdateDone(counts: RolloutUpdateCounts): string {
  return counts.members > 0 ? `Updated for ${membersLabel(counts.members)}` : NOTHING_TO_UPDATE;
}
