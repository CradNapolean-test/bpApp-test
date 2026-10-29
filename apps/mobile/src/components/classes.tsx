import { Link } from 'expo-router';
import { ScrollView, View } from 'react-native';

import type { BookingRow, ClientMembershipRow, ScheduleOccurrence } from '@ballistic/shared/data/types';
import { bookSummary, cancelSummary, slotState, spots } from '@ballistic/shared/utils/booking';
import { cancelDeadline, cancelNote } from '@ballistic/shared/utils/cancelDeadline';
import { addDays, formatClassTime, toIsoDate, WEEKDAY_SHORT } from '@ballistic/shared/utils/dates';

import { Pressable } from '@/components/press';
import { CheckInStatus } from '@/components/today';
import { AppText, Button, Card, SheetFrame } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

const parseDay = (iso: string) => new Date(`${iso}T00:00:00Z`);
export function dayLabel(iso: string, todayIso: string): string {
  if (iso === todayIso) return 'Today';
  if (iso === toIsoDate(addDays(parseDay(todayIso), 1))) return 'Tomorrow';
  return parseDay(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
}
const longDay = (iso: string) => parseDay(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' });
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

// ---------- credits header (taps through to the credits screen) ----------
export function CreditsHeader({ balance, membership, nextReset }: { balance: number; membership: ClientMembershipRow | null; nextReset: string }) {
  const t = useTheme();
  const pkg = membership?.package;
  return (
    <Link href="/credits" asChild>
      <Pressable accessibilityRole="button" accessibilityLabel="Credits and membership">
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md, borderWidth: 1, borderColor: t.accent, backgroundColor: t.accentSoft, borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
          <View>
            <AppText style={{ color: t.accent, fontSize: 26, fontWeight: '900', lineHeight: 28 }}>{balance}</AppText>
            <AppText variant="small" color="muted">{balance === 1 ? 'credit' : 'credits'} left</AppText>
          </View>
          <View style={{ alignItems: 'flex-end', flexShrink: 1 }}>
            <AppText style={{ fontWeight: '700' }} numberOfLines={1}>{pkg?.name ?? 'No membership'}</AppText>
            {pkg ? (
              <AppText variant="small" color="muted">
                {pkg.credits_per_week}/week · resets {parseDay(nextReset).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' })}
              </AppText>
            ) : null}
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

// ---------- day strip ----------
export function DayStrip({ days, selected, sessionDates, bookedDates, onSelect }: { days: string[]; selected: string; sessionDates: Set<string>; bookedDates: Set<string>; onSelect: (d: string) => void }) {
  const t = useTheme();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 2 }}>
      {days.map((d) => {
        const dt = parseDay(d);
        const active = d === selected;
        const has = sessionDates.has(d);
        return (
          <Pressable
            key={d}
            onPress={() => onSelect(d)}
            accessibilityRole="button"
            accessibilityLabel={longDay(d)}
            accessibilityState={{ selected: active }}
            style={{ width: 52, alignItems: 'center', gap: 2, paddingVertical: 10, borderRadius: radius.lg, borderWidth: 1, borderColor: active ? t.accent : has ? t.border : 'transparent', backgroundColor: active ? t.accent : has ? t.card : 'transparent' }}>
            <AppText style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: active ? t.accentForeground : has ? t.muted : t.border }}>{WEEKDAY_SHORT[dt.getUTCDay()]}</AppText>
            <AppText style={{ fontSize: 16, fontWeight: '900', color: active ? t.accentForeground : has ? t.foreground : t.muted }}>{dt.getUTCDate()}</AppText>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: bookedDates.has(d) ? (active ? t.accentForeground : t.accent) : 'transparent' }} />
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

// ---------- one session in the list ----------
export function SessionSlot({ occ, existing, onBook, onManage }: { occ: ScheduleOccurrence; existing: BookingRow | undefined; onBook: () => void; onManage: () => void }) {
  const t = useTheme();
  const state = slotState(occ, existing);
  const s = spots(occ);
  const tone = s.full ? t.danger : s.scarce ? t.warning : t.muted;
  const pill = (label: string, color: string, bg: string, onPress: () => void) => (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ backgroundColor: bg, borderRadius: 999, paddingHorizontal: 18, paddingVertical: 9 }}>
      <AppText style={{ color, fontWeight: '800' }}>{label}</AppText>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, padding: 14, borderRadius: radius.lg, borderWidth: 1, borderColor: state === 'booked' ? t.success : t.border, backgroundColor: state === 'booked' ? 'rgba(16,185,129,0.08)' : t.card }}>
      <View style={{ flexShrink: 1, gap: 2 }}>
        <AppText style={{ fontSize: 20, fontWeight: '800' }}>{formatClassTime(occ.startTime)}</AppText>
        <AppText variant="small" color="muted" numberOfLines={1}>{occ.className}</AppText>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
          <View style={{ width: 56, height: 4, borderRadius: 2, backgroundColor: t.cardMuted, overflow: 'hidden' }}>
            <View style={{ width: `${s.fillPct}%`, height: 4, backgroundColor: s.full ? t.danger : s.scarce ? t.warning : t.accent }} />
          </View>
          <AppText variant="small" style={{ color: tone, fontWeight: '600' }}>{s.full ? 'Full' : `${s.left} left`}</AppText>
        </View>
      </View>
      {state === 'booked'
        ? pill('Booked ✓', t.success, 'rgba(16,185,129,0.15)', onManage)
        : state === 'waitlisted'
          ? pill('On waitlist', t.warning, 'rgba(245,158,11,0.15)', onManage)
          : state === 'full'
            ? pill('Waitlist', t.warning, 'transparent', onBook)
            : pill('Book', t.accentForeground, t.accent, onBook)}
    </View>
  );
}

// ---------- confirmation sheets ----------
function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'good' }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md, paddingVertical: 10 }}>
      <AppText color="muted">{label}</AppText>
      <AppText style={{ fontWeight: '700', textAlign: 'right', flexShrink: 1 }} color={tone === 'warn' ? 'warning' : tone === 'good' ? 'success' : undefined}>{value}</AppText>
    </View>
  );
}

export function BookSheet({ occ, balance, busy, error, onConfirm, onClose }: { occ: ScheduleOccurrence; balance: number; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const s = bookSummary(occ, balance);
  const deadline = cancelDeadline(occ.date, occ.startTime, occ.cutoffHours, occ.blackoutStart, occ.blackoutEnd);
  return (
    <SheetFrame title={s.full ? 'Join the waitlist' : 'Book this session'} onClose={onClose}>
      <View>
        <SummaryRow label="Session" value={occ.className} />
        <SummaryRow label="When" value={`${longDay(occ.date)} · ${formatClassTime(occ.startTime)}`} />
        {!s.full ? (
          <>
            <SummaryRow label="Cost" value={plural(s.cost, 'credit')} />
            <SummaryRow label="You'll have left" value={s.enough ? plural(s.left, 'credit') : `Only ${balance}`} tone={s.enough ? undefined : 'warn'} />
          </>
        ) : null}
      </View>
      <AppText variant="small" color="muted">
        {s.full ? "This session is full. You'll be booked in automatically if a spot opens and you have a credit. Nothing is used until then." : cancelNote(deadline)}
      </AppText>
      {!s.full && !s.enough ? <AppText color="warning" style={{ fontWeight: '600' }}>You don&apos;t have enough credits for this session. Ask your coach to top up.</AppText> : null}
      {error ? <AppText color="danger">{error}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="Not now" variant="secondary" onPress={onClose} /></View>
        <View style={{ flex: 1.4 }}><Button title={s.full ? 'Join waitlist' : 'Confirm booking'} loading={busy} disabled={!s.canConfirm} onPress={onConfirm} /></View>
      </View>
    </SheetFrame>
  );
}

export function CancelSheet({ booking, nowMs, blackoutStart, blackoutEnd, busy, error, onConfirm, onClose }: { booking: BookingRow; nowMs: number; blackoutStart: string | null; blackoutEnd: string | null; busy: boolean; error: string | null; onConfirm: () => void; onClose: () => void }) {
  const { waitlisted, late } = cancelSummary(booking, nowMs, blackoutStart, blackoutEnd);
  return (
    <SheetFrame title={waitlisted ? 'Leave the waitlist?' : 'Cancel this booking?'} onClose={onClose}>
      <View>
        <SummaryRow label="Session" value={booking.class?.name ?? 'Session'} />
        <SummaryRow label="When" value={`${longDay(booking.booking_date)} · ${formatClassTime(booking.class?.start_time)}`} />
        {!waitlisted ? <SummaryRow label="Your credit" value={late ? 'Not refunded' : 'Refunded'} tone={late ? 'warn' : 'good'} /> : null}
      </View>
      <AppText variant="small" color={late ? 'danger' : 'muted'} style={late ? { fontWeight: '600' } : undefined}>
        {waitlisted ? "You won't be charged anything." : late ? "It's too close to the session to get your credit back. You can still cancel, but it won't be refunded." : 'You can cancel now and get your credit back.'}
      </AppText>
      {error ? <AppText color="danger">{error}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}><Button title="Keep it" variant="secondary" onPress={onClose} /></View>
        <View style={{ flex: 1.4 }}><Button title={waitlisted ? 'Leave waitlist' : late ? 'Cancel anyway' : 'Cancel booking'} loading={busy} onPress={onConfirm} /></View>
      </View>
    </SheetFrame>
  );
}

// ---------- My bookings ----------
export function MyBookingCard({ booking, todayIso, tz, now, nowMs, blackoutStart, blackoutEnd, onCancel }: { booking: BookingRow; todayIso: string; tz: string; now: Date; nowMs: number; blackoutStart: string | null; blackoutEnd: string | null; onCancel: () => void }) {
  const t = useTheme();
  const { waitlisted, late, deadline } = cancelSummary(booking, nowMs, blackoutStart, blackoutEnd);
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: spacing.md }}>
        <View style={{ flexShrink: 1 }}>
          <AppText style={{ fontSize: 20, fontWeight: '800' }}>{formatClassTime(booking.class?.start_time)}</AppText>
          <AppText variant="small" color="muted" numberOfLines={1}>{booking.class?.name}</AppText>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <View style={{ backgroundColor: waitlisted ? 'rgba(245,158,11,0.15)' : 'rgba(16,185,129,0.15)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
            <AppText variant="small" style={{ color: waitlisted ? t.warning : t.success, fontWeight: '700' }}>{waitlisted ? 'Waitlist' : 'Booked'}</AppText>
          </View>
          <Pressable onPress={onCancel} accessibilityRole="button" style={{ borderWidth: 1, borderColor: t.border, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6 }}>
            <AppText variant="small" style={{ fontWeight: '700' }}>{waitlisted ? 'Leave' : 'Cancel'}</AppText>
          </Pressable>
        </View>
      </View>
      {deadline ? (
        <AppText variant="small" color={late ? 'danger' : 'muted'}>
          {late ? 'Past the cancel deadline. Cancelling now forfeits your credit.' : cancelNote(deadline)}
        </AppText>
      ) : null}
      {!waitlisted && booking.booking_date === todayIso ? <CheckInStatus booking={booking} tz={tz} now={now} /> : null}
    </Card>
  );
}
