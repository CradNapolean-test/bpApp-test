import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import type { BookingRow, ScheduleOccurrence } from '@ballistic/shared/data/types';
import { bookableOccurrences, bookingWindowDays, isMorning, nextResetDate } from '@ballistic/shared/utils/booking';
import { nowLocalMs } from '@ballistic/shared/utils/cancelDeadline';
import { addDays, formatClassTime, isoDateInTz, toIsoDate } from '@ballistic/shared/utils/dates';

import { BookSheet, CancelSheet, CreditsHeader, DayStrip, dayLabel, MyBookingCard, SessionSlot } from '@/components/classes';
import { CardsSkeleton } from '@/components/skeleton';
import { AppText, Button, Card, Screen, ScrollScreen, Segmented } from '@/components/ui';
import { useBookClass, useCancelBooking, useMyBookings, useSchedule } from '@/lib/classes';
import { timezoneOf, useClientProfile, useCredits, useNow } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { spacing, useTheme } from '@/theme';

type View_ = 'book' | 'mine';
type Sheet = { kind: 'book'; occ: ScheduleOccurrence } | { kind: 'cancel'; booking: BookingRow } | null;

export default function Classes() {
  const t = useTheme();
  const now = useNow(30_000);
  const profileQ = useClientProfile();
  const profile = profileQ.data ?? null;
  const tz = timezoneOf(profile);
  const todayIso = isoDateInTz(now, tz);
  const nowMs = nowLocalMs(tz, now);

  const meQ = useMe();
  const creditsQ = useCredits();
  const membership = creditsQ.data?.membership ?? null;
  const windowDays = bookingWindowDays(membership?.package?.advance_booking_days);
  const weeksAhead = Math.max(3, Math.ceil((windowDays + 1) / 7));
  const gymId = meQ.data?.gymId ?? null;

  // The profile holds the timezone that decides "today", so nothing date-specific is fetched before it is known.
  const scheduleQ = useSchedule(gymId, todayIso, weeksAhead, !!profile);
  const bookingsQ = useMyBookings(todayIso, !!profile);
  const book = useBookClass();
  const cancel = useCancelBooking();

  const [view, setView] = useState<View_>('book');
  const [picked, setPicked] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [note, setNote] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  if (profileQ.isPending || meQ.isPending) return <CardsSkeleton rows={5} height={72} />;
  if (profileQ.isError || meQ.isError) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="danger">Could not load your account.</AppText>
        <Button title="Try again" onPress={() => { profileQ.refetch(); meQ.refetch(); }} />
      </Screen>
    );
  }
  if (!gymId) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText variant="heading">No gym set up</AppText>
        <AppText color="muted">Your account isn&apos;t linked to a gym yet. Ask your coach.</AppText>
      </Screen>
    );
  }

  const schedule = scheduleQ.data;
  const blackoutStart = schedule?.blackoutStart ?? null;
  const blackoutEnd = schedule?.blackoutEnd ?? null;
  const cutoffHours = schedule?.cutoffHours ?? 3;
  const bookings = bookingsQ.data ?? [];
  const bookingByKey = new Map(bookings.map((b) => [`${b.class_id}|${b.booking_date}`, b]));
  const bookedDates = new Set(bookings.filter((b) => b.status === 'booked').map((b) => b.booking_date));

  const bookable = bookableOccurrences(schedule?.occurrences ?? [], nowMs, todayIso, windowDays);
  const sessionDates = new Set(bookable.map((o) => o.date));
  const days = Array.from({ length: windowDays + 1 }, (_, i) => toIsoDate(addDays(new Date(todayIso + 'T00:00:00Z'), i)));
  const selected = picked && days.includes(picked) ? picked : days.find((d) => sessionDates.has(d)) ?? days[0];
  const dayOccs = bookable.filter((o) => o.date === selected).sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''));
  const morning = dayOccs.filter(isMorning);
  const later = dayOccs.filter((o) => !isMorning(o));

  const policy = blackoutStart && blackoutEnd
    ? `Cancel at least ${cutoffHours} hours before a session to keep your credit. Overnight (${blackoutStart.slice(0, 5)}–${blackoutEnd.slice(0, 5)}) doesn't count, so for early-morning sessions, cancel by ${blackoutStart.slice(0, 5)} the night before.`
    : `Cancel at least ${cutoffHours} hours before a session to keep your credit.`;

  async function refresh() {
    setRefreshing(true);
    await Promise.all([scheduleQ.refetch(), bookingsQ.refetch(), creditsQ.refetch()]);
    setRefreshing(false);
  }

  async function confirmBook(occ: ScheduleOccurrence) {
    try {
      const r = await book.mutateAsync({ classId: occ.classId, date: occ.date });
      setNote(r.status === 'waitlist' ? `You're on the waitlist for ${formatClassTime(occ.startTime)}.` : `Booked: ${dayLabel(occ.date, todayIso)} at ${formatClassTime(occ.startTime)}.`);
      setSheet(null);
    } catch {
      /* the message is shown in the sheet from book.error */
    }
  }
  async function confirmCancel(b: BookingRow) {
    try {
      await cancel.mutateAsync({ bookingId: b.id });
      setNote(b.status === 'waitlist' ? 'Left the waitlist.' : 'Booking cancelled.');
      setSheet(null);
    } catch {
      /* shown in the sheet */
    }
  }
  const openSheet = (s: Sheet) => { book.reset(); cancel.reset(); setNote(null); setSheet(s); };

  const slot = (occ: ScheduleOccurrence) => {
    const existing = bookingByKey.get(`${occ.classId}|${occ.date}`);
    return <SessionSlot key={`${occ.classId}|${occ.date}`} occ={occ} existing={existing} onBook={() => openSheet({ kind: 'book', occ })} onManage={() => existing && openSheet({ kind: 'cancel', booking: existing })} />;
  };

  return (
    <>
      <ScrollScreen refreshing={refreshing} onRefresh={refresh}>
        <CreditsHeader balance={creditsQ.data?.balance ?? 0} membership={membership} nextReset={nextResetDate(todayIso)} />
        <Segmented<View_> value={view} onChange={(v) => { setNote(null); setView(v); }} options={[{ value: 'book', label: 'Book a session' }, { value: 'mine', label: bookings.length ? `My bookings (${bookings.length})` : 'My bookings' }]} />
        <AppText variant="small" color="muted">{policy}</AppText>
        {note ? <AppText color="success" style={{ fontWeight: '600' }}>{note}</AppText> : null}
        {scheduleQ.isError ? <AppText color="danger">Could not load the timetable: {scheduleQ.error.message}</AppText> : null}

        {view === 'book' ? (
          <>
            <AppText variant="small" color="muted" style={{ fontWeight: '600' }}>
              {new Date(selected + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}
            </AppText>
            <DayStrip days={days} selected={selected} sessionDates={sessionDates} bookedDates={bookedDates} onSelect={(d) => setPicked(d)} />
            <AppText variant="heading">{dayLabel(selected, todayIso)}</AppText>
            {scheduleQ.isPending ? (
              <ActivityIndicator color={t.accent} />
            ) : dayOccs.length === 0 ? (
              <Card>
                <AppText color="muted">{(schedule?.occurrences.length ?? 0) === 0 ? 'No sessions scheduled yet. Check back once your coach adds sessions.' : 'Nothing on this day. Pick another day above; days with sessions are brighter.'}</AppText>
              </Card>
            ) : (
              <View style={{ gap: spacing.md }}>
                {morning.length ? (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>Morning</AppText>
                    {morning.map(slot)}
                  </View>
                ) : null}
                {later.length ? (
                  <View style={{ gap: spacing.sm }}>
                    <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>Afternoon &amp; evening</AppText>
                    {later.map(slot)}
                  </View>
                ) : null}
              </View>
            )}
          </>
        ) : bookings.length === 0 ? (
          <Card style={{ gap: spacing.sm }}>
            <AppText color="muted">No upcoming bookings. Book a session and it will show up here.</AppText>
            <Button title="Book a session" onPress={() => setView('book')} />
          </Card>
        ) : (
          <View style={{ gap: spacing.sm }}>
            {bookings.map((b, i) => (
              <View key={b.id} style={{ gap: spacing.xs }}>
                {i === 0 || bookings[i - 1].booking_date !== b.booking_date ? (
                  <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1, marginTop: i === 0 ? 0 : spacing.sm }}>{dayLabel(b.booking_date, todayIso)}</AppText>
                ) : null}
                <MyBookingCard booking={b} todayIso={todayIso} tz={tz} now={now} nowMs={nowMs} blackoutStart={blackoutStart} blackoutEnd={blackoutEnd} onCancel={() => openSheet({ kind: 'cancel', booking: b })} />
              </View>
            ))}
          </View>
        )}
      </ScrollScreen>

      {sheet?.kind === 'book' ? (
        <BookSheet occ={sheet.occ} balance={creditsQ.data?.balance ?? 0} busy={book.isPending} error={book.error?.message ?? null} onConfirm={() => confirmBook(sheet.occ)} onClose={() => setSheet(null)} />
      ) : null}
      {sheet?.kind === 'cancel' ? (
        <CancelSheet booking={sheet.booking} nowMs={nowMs} blackoutStart={blackoutStart} blackoutEnd={blackoutEnd} busy={cancel.isPending} error={cancel.error?.message ?? null} onConfirm={() => confirmCancel(sheet.booking)} onClose={() => setSheet(null)} />
      ) : null}
    </>
  );
}
