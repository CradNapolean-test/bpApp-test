import type { PushPayload } from './push';
import { sessionLabel } from './classCancelPush';
import { cancelNote, type CancelDeadline } from './utils/cancelDeadline';

// The push a member gets when a place opens and they come off the waitlist (BK9). Same message as the in-app notice that
// promote_from_waitlist writes (migration 0158), in push length. Pure, so the wording is tested.
export function waitlistPromotionPayload(input: {
  className: string;
  date: string;
  startTime: string | null;
  // Moved in after the cancel deadline: refunded if cancelled any time before the start (decision D1).
  promotedAfterCutoff: boolean;
  deadline: CancelDeadline | null;
}): PushPayload {
  const howToCancel = input.promotedAfterCutoff
    ? "Can't make it? Cancel before it starts for a full refund."
    : input.deadline
      ? `${cancelNote(input.deadline)}.`
      : '';
  return {
    title: "You're off the waitlist",
    body: `You're booked into ${sessionLabel(input.className, input.date, input.startTime)}. ${howToCancel}`.trim(),
    url: '/dashboard?open=book',
    tag: `waitlist-${input.date}-${input.className}`.slice(0, 80),
  };
}
