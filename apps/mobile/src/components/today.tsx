import { useRouter } from 'expo-router';
import { View } from 'react-native';

import type { BookingRow, ClientProfileRow } from '@ballistic/shared/data/types';
import { checkinWindow } from '@ballistic/shared/utils/checkinWindow';
import { formatClassTime } from '@ballistic/shared/utils/dates';

import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { AppText, Button } from '@/components/ui';
import { useCheckIn, type TodayWorkout } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// The greeting: the time of day and the member's first name. (Credits live on the Book and Profile screens.)
export function Hero({ profile, now }: { profile: ClientProfileRow; now: Date }) {
  const hour = now.getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';
  const firstName = profile.name?.trim().split(/\s+/)[0] ?? 'there';
  return (
    <View style={{ paddingHorizontal: 4 }}>
      <AppText color="muted" variant="small">{greeting}</AppText>
      <AppText style={{ fontSize: 26, fontWeight: '900' }} numberOfLines={1}>
        {firstName}
      </AppText>
    </View>
  );
}

const NO_WORKOUT_REASON = {
  no_program: "You don't have an active programme running right now.",
  ended: "You don't have an active programme running right now.",
  rest_day: "Your programme doesn't have a workout set for this day of the week yet.",
} as const;

// Check-in for a booking on today's date: "Checked in", when it opens, that it has closed, or the button.
// Shared by the Today card and the My bookings list.
export function CheckInStatus({ booking, tz, now, reason }: { booking: BookingRow; tz: string; now: Date; reason?: string | null }) {
  const checkIn = useCheckIn();
  const win = checkinWindow(booking.class?.start_time ?? null, booking.booking_date, tz, now);
  if (booking.attended) return <AppText variant="small" color="success" style={{ fontWeight: '700' }}>Checked in ✓</AppText>;
  if (win.state === 'not_open_yet') return <AppText variant="small" color="muted">Check-in opens at {win.opensAt}</AppText>;
  if (win.state === 'closed') return <AppText variant="small" color="muted">Check-in has closed for this session.</AppText>;
  return (
    <View style={{ gap: spacing.xs }}>
      <Button title="Check in" loading={checkIn.isPending} onPress={() => booking.class && checkIn.mutate({ classId: booking.class_id, date: booking.booking_date })} />
      {reason ? <AppText variant="small" color="muted">{reason}</AppText> : null}
      {checkIn.isError ? <AppText variant="small" color="danger">{checkIn.error.message}</AppText> : null}
    </View>
  );
}

export function NextSessionCard({
  booking,
  todayIso,
  tz,
  now,
  workout,
}: {
  booking: BookingRow | undefined;
  todayIso: string;
  tz: string;
  now: Date;
  workout: TodayWorkout | undefined;
}) {
  const t = useTheme();
  const router = useRouter();
  const label = booking ? (booking.booking_date === todayIso ? 'Today' : 'Next session') : 'Your next session';
  const isToday = booking?.booking_date === todayIso;
  const reason = workout && workout.status !== 'workout' ? NO_WORKOUT_REASON[workout.status] : null;

  // The next session and My bookings are one tile (web 345fc6a): the session on top, a row to manage bookings underneath, or a pill to book.
  return (
    <View style={{ borderWidth: 1, borderColor: t.accent + '4D', backgroundColor: t.accentSoft, borderRadius: 24, padding: spacing.md, gap: spacing.sm, alignItems: 'center' }}>
      <AppText variant="small" color="accent" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.4, textAlign: 'center' }}>
        {label}
      </AppText>
      {booking ? (
        <>
          <Pressable onPress={() => router.navigate('/classes')} accessibilityRole="button" accessibilityLabel={`${booking.class?.name ?? 'Session'}. Open Book`} style={{ alignItems: 'center' }}>
            <AppText style={{ fontSize: 30, fontWeight: '900', textAlign: 'center' }}>{formatClassTime(booking.class?.start_time) || booking.class?.name}</AppText>
            <AppText color="muted" style={{ textAlign: 'center' }}>
              {booking.class?.name} ·{' '}
              {isToday ? 'today' : new Date(booking.booking_date + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', timeZone: 'UTC' })}
            </AppText>
          </Pressable>
          {isToday ? <CheckInStatus booking={booking} tz={tz} now={now} reason={reason} /> : null}
          <Pressable
            onPress={() => router.navigate('/classes')}
            accessibilityRole="button"
            accessibilityLabel="My bookings. Book and manage"
            style={{ alignSelf: 'stretch', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderTopWidth: 1, borderTopColor: t.accent + '33', paddingTop: 12, minHeight: 44 }}
          >
            <Icon name="calendarDays" size={16} color={t.accent} />
            <AppText style={{ fontWeight: '800' }}>My bookings</AppText>
            <AppText variant="small" color="muted">Book &amp; manage</AppText>
            <Icon name="chevronRight" size={16} color={t.accent} />
          </Pressable>
        </>
      ) : (
        <>
          <AppText color="muted" style={{ textAlign: 'center' }}>You don&apos;t have anything booked.</AppText>
          <Pressable
            onPress={() => router.navigate('/classes')}
            accessibilityRole="button"
            style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 22, minHeight: 44, justifyContent: 'center' }}
          >
            <AppText style={{ color: t.accentForeground, fontWeight: '800' }}>Book a session</AppText>
          </Pressable>
        </>
      )}
    </View>
  );
}
