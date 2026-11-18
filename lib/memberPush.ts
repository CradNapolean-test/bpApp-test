import type { PushPayload } from './push';
import { DEFAULT_TIMEZONE } from './utils/dates';

// What a member is told when their coach does something for them (decision D20): their plan is ready, a programme is set up for them,
// or credits are added. Each is an in-app notice (the bell) and a push with the same words; the push only reaches phones once push is
// switched on in production (lib/push.ts skips it until then). Pure, so the wording is tested; lib/memberNotify.ts sends them.

export interface MemberMessage {
  // The in-app notice (notifications.message).
  notice: string;
  push: PushPayload;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 3)}...` : text);
const credits = (n: number) => `${n} credit${n === 1 ? '' : 's'}`;

// The coach cleared the "review their starting plan" flag.
export function planReadyMessage(): MemberMessage {
  const body = 'Your coach has checked your plan. Your daily targets are ready in the app.';
  return { notice: body, push: { title: 'Your plan is ready', body, url: '/dashboard?open=nutrition', tag: 'plan-ready' } };
}

// The coach started a programme for the member from a template.
export function programmeAssignedMessage(programName: string | null | undefined): MemberMessage {
  const name = programName?.trim();
  const shown = name ? clip(name, 60) : 'a new programme';
  // A clipped name already ends in "...", so it gets no full stop of its own.
  const body = `Your coach has set you up with ${shown}${shown.endsWith('...') ? '' : '.'} Open Training to see your workouts.`;
  return { notice: body, push: { title: 'New programme', body, url: '/dashboard?open=training', tag: 'programme-assigned' } };
}

// A programme given out through a rollout ("Everyone at the gym" or chosen members): who is told, grouped by rollout so each group gets
// that rollout's programme name. Everyone with a copy made by the rollout, once each; never whoever started it (the D20 rule for one
// member: told when a coach sets them up, not when they start one themselves). A rollout with no copies sends nothing.
export interface RolloutForNotice {
  id: string;
  program_name: string | null;
  created_by: string | null;
}
export interface RolloutCopy {
  client_id: string;
  rollout_id: string | null;
}
export interface RolloutNoticeGroup {
  rolloutId: string;
  programName: string | null;
  clientIds: string[];
}

export function rolloutRecipients(rollouts: RolloutForNotice[], copies: RolloutCopy[]): RolloutNoticeGroup[] {
  const groups: RolloutNoticeGroup[] = [];
  for (const r of rollouts) {
    const clientIds = [...new Set(copies.filter((c) => c.rollout_id === r.id && c.client_id !== r.created_by).map((c) => c.client_id))];
    if (clientIds.length) groups.push({ rolloutId: r.id, programName: r.program_name, clientIds });
  }
  return groups;
}

// "1 Dec" in the gym's timezone.
function shortDate(iso: string, timeZone: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone });
}

// The coach added credits by hand, or gave a credit pack.
export function creditsAddedMessage(input: {
  amount: number;
  // A pack's name, when it was a pack.
  packName?: string | null;
  expiresAt?: string | null;
  timeZone?: string | null;
}): MemberMessage {
  const n = Math.max(0, Math.round(input.amount));
  const pack = input.packName?.trim();
  const until = input.expiresAt ? shortDate(input.expiresAt, input.timeZone || DEFAULT_TIMEZONE) : null;
  const what = pack ? `the ${clip(pack, 40)}${/\bpack\b/i.test(pack) ? '' : ' pack'} (${credits(n)})` : credits(n);
  const body = `Your coach added ${what} to your account${until ? `, to use by ${until}` : ''}. Book a class whenever you're ready.`;
  return { notice: body, push: { title: `${credits(n)} added`, body, url: '/dashboard?open=book', tag: 'credits-added' } };
}
