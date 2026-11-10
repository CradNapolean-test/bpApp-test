import { createAdminClient } from '@/lib/supabase/admin';
import { pushQuietly, sendPushToClient } from '@/lib/push';
import { cancelDeadline } from '@/lib/utils/cancelDeadline';
import { waitlistPromotionPayload } from '@/lib/waitlistPromotionPush';

// Push for a waitlist promotion (BK9). The database moves the member in and writes the in-app notice (promote_from_waitlist, migration
// 0158); this is the part that reaches someone who is not looking at the app. Server-only. Uses the admin client because the member who
// cancels can't see who is waiting; nothing read here goes back to them. Never throws: a missed push must not fail the cancel.
//
// The phone app cancels straight through the database (apps/mobile/src/lib/classes.ts), so a cancel made there gets the in-app notice
// but no push.

export interface WaitlistBefore {
  classId: string;
  date: string;
  waitlistIds: string[];
}

// Read BEFORE the cancel: who is waiting for the place this booking frees. Null when it isn't a booked place or nobody is waiting.
export async function waitlistBeforeCancel(bookingId: string): Promise<WaitlistBefore | null> {
  try {
    const admin = createAdminClient();
    const { data: booking } = await admin.from('bookings').select('class_id, booking_date, status').eq('id', bookingId).maybeSingle();
    if (!booking || booking.status !== 'booked') return null;
    const { data: waiting } = await admin
      .from('bookings')
      .select('id')
      .eq('class_id', booking.class_id)
      .eq('booking_date', booking.booking_date)
      .eq('status', 'waitlist');
    if (!waiting || waiting.length === 0) return null;
    return { classId: booking.class_id as string, date: booking.booking_date as string, waitlistIds: waiting.map((w) => w.id as string) };
  } catch {
    return null;
  }
}

// AFTER the cancel: whoever on that list is now booked was moved in by it. Returns how many were sent a push.
export async function notifyWaitlistPromotion(before: WaitlistBefore): Promise<number> {
  try {
    const admin = createAdminClient();
    const { data: promoted } = await admin
      .from('bookings')
      .select('client_id, promoted_after_cutoff')
      .in('id', before.waitlistIds)
      .eq('status', 'booked');
    if (!promoted || promoted.length === 0) return 0;

    const { data: session } = await admin.from('classes').select('name, start_time, cutoff_hours, gym_id').eq('id', before.classId).maybeSingle();
    if (!session) return 0;
    const { data: gym } = await admin.from('gyms').select('blackout_start, blackout_end').eq('id', session.gym_id as string).maybeSingle();
    const startTime = (session.start_time as string | null) ?? null;
    const deadline = cancelDeadline(before.date, startTime, session.cutoff_hours as number, gym?.blackout_start ?? null, gym?.blackout_end ?? null);

    let sent = 0;
    await Promise.all(
      promoted.map(async (p) => {
        const result = await pushQuietly('waitlist promotion', () =>
          sendPushToClient(
            p.client_id as string,
            waitlistPromotionPayload({
              className: session.name as string,
              date: before.date,
              startTime,
              promotedAfterCutoff: !!p.promoted_after_cutoff,
              deadline,
            })
          )
        );
        sent += result?.sent ?? 0;
      })
    );
    return sent;
  } catch {
    return 0;
  }
}
