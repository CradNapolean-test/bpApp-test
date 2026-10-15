import { classCancelPayload } from '@/lib/classCancelPush';
import { pushQuietly, sendPushToClient } from '@/lib/push';

// Sends the cancellation push to each affected member. Server-only; never throws (a missed push must not undo or fail the cancellation).
export async function notifyClassCancelled(input: {
  members: { clientId: string; refunded: boolean }[];
  className: string;
  date: string;
  startTime: string | null;
  reason?: string | null;
}): Promise<{ attempted: number; sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  await Promise.all(
    input.members.map(async (m) => {
      const result = await pushQuietly('class cancelled', () =>
        sendPushToClient(m.clientId, classCancelPayload({ className: input.className, date: input.date, startTime: input.startTime, refunded: m.refunded, reason: input.reason }))
      );
      sent += result?.sent ?? 0;
      failed += result?.failed ?? (result ? 0 : 1);
    })
  );
  return { attempted: input.members.length, sent, failed };
}
