import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { detailsSnoozeKey, snoozedRecently } from '@ballistic/shared/utils/detailsConfirm';
import type { EventWithSignup } from '@ballistic/shared/data/types';
import type { ClubProgress } from '@ballistic/shared/utils/clubs';
import { formatDateTime } from '@ballistic/shared/utils/dates';

import { Pressable } from '@/components/press';
import { Icon, type IconName } from '@/components/icons';
import { AppText, Card, SectionLabel } from '@/components/ui';
import { authStorage } from '@/lib/authStorage';
import { radius, spacing, useTheme } from '@/theme';

// The round icon badge used on tiles and rows.
export function IconChip({ icon, tone = 'muted', size = 36 }: { icon: IconName; tone?: 'accent' | 'muted' | 'warning'; size?: number }) {
  const t = useTheme();
  const bg = tone === 'accent' ? t.accentSoft : tone === 'warning' ? 'rgba(245,158,11,0.12)' : t.cardMuted;
  const fg = tone === 'accent' ? t.accent : tone === 'warning' ? t.warning : t.muted;
  return (
    <View style={{ width: size, height: size, borderRadius: size / 3, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

export function Tile({ icon, title, subtitle, highlight, onPress }: { icon: IconName; title: string; subtitle: string; highlight?: boolean; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}, ${subtitle}`}
      style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.lg, borderWidth: 1, borderColor: highlight ? t.accent : t.border, backgroundColor: highlight ? t.accentSoft : t.card }}>
      <IconChip icon={icon} tone={highlight ? 'accent' : 'muted'} />
      <View style={{ flexShrink: 1 }}>
        <AppText style={{ fontWeight: '700', fontSize: 14 }} numberOfLines={1}>{title}</AppText>
        <AppText variant="small" color="muted" numberOfLines={1}>{subtitle}</AppText>
      </View>
    </Pressable>
  );
}

// "My coaching": a full-width tile under the next session, laid out like it (small teal label, big line, a divider and an action row).
// The top opens the coaching hub; the row opens the chat with the coach (web 345fc6a, e574159).
export function MyCoachingTile() {
  const t = useTheme();
  const router = useRouter();
  return (
    <View style={{ borderWidth: 1, borderColor: t.accent + '4D', backgroundColor: t.accentSoft, borderRadius: 24, padding: spacing.md }}>
      <Pressable onPress={() => router.navigate('/coach')} accessibilityRole="button" accessibilityLabel="My coaching. Training and nutrition" style={{ alignItems: 'center' }}>
        <AppText variant="small" color="accent" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1.4 }}>My coaching</AppText>
        <AppText style={{ fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: 2 }}>Training and nutrition</AppText>
      </Pressable>
      <Pressable
        onPress={() => router.navigate('/chat')}
        accessibilityRole="button"
        accessibilityLabel="Message your coach"
        style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, borderTopWidth: 1, borderTopColor: t.accent + '33', marginTop: 12, paddingTop: 12, minHeight: 44 }}
      >
        <Icon name="messagesSquare" size={16} color={t.accent} />
        <AppText style={{ fontWeight: '800' }}>Message your coach</AppText>
        <Icon name="chevronRight" size={16} color={t.accent} />
      </Pressable>
    </View>
  );
}

// "Next event": the soonest gym event that has not started. Closing it hides that event on this phone only (web f4990a0).
const eventDismissKey = (id: string) => `bp-event-banner-dismissed-${id}`;
export function EventBanner({ event }: { event: EventWithSignup }) {
  const t = useTheme();
  const router = useRouter();
  const [closed, setClosed] = useState(() => {
    try {
      return authStorage.getItem(eventDismissKey(event.id)) === '1';
    } catch {
      return false; // storage can be blocked: show the banner rather than hide it
    }
  });
  if (closed) return null;
  const when = formatDateTime(event.starts_at);
  const dismiss = () => {
    try {
      authStorage.setItem(eventDismissKey(event.id), '1');
    } catch {
      // not remembered; it comes back next time the app opens
    }
    setClosed(true);
  };
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: t.accent + '4D', backgroundColor: t.accentSoft, borderRadius: radius.lg, paddingLeft: 14 }}>
      <Pressable onPress={() => router.navigate('/events')} accessibilityRole="button" accessibilityLabel={`Next event: ${event.title}. ${when}. Open events`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 }}>
        <Icon name="calendarDays" size={20} color={t.accent} />
        <View style={{ flex: 1 }}>
          <AppText style={{ fontWeight: '800', textAlign: 'center' }} numberOfLines={1}>Next event: {event.title}</AppText>
          <AppText variant="small" color="muted" style={{ textAlign: 'center' }} numberOfLines={1}>
            {when}{event.location ? ` · ${event.location}` : ''}{event.signedUp ? ' · You are in' : ''}
          </AppText>
        </View>
      </Pressable>
      <Pressable onPress={dismiss} accessibilityRole="button" accessibilityLabel="Dismiss" style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="x" size={16} color={t.muted} />
      </Pressable>
    </View>
  );
}

// Streak and today's check-in, side by side. Both open the daily check-in.
export function StatsCard({ streak, showStreak = true, checkinDone, checkinTotal, enabled = true }: { streak: number; showStreak?: boolean; checkinDone: number; checkinTotal: number; enabled?: boolean }) {
  const t = useTheme();
  const router = useRouter();
  // The check-in half goes when the member's plan has no daily check-in, or their coach switched every measure off.
  const showCheckin = enabled && checkinTotal > 0;
  if (!showStreak && !showCheckin) return null;
  const cell = (icon: IconName, value: string, label: string) => (
    <Pressable onPress={() => router.navigate('/checkin')} disabled={!enabled} accessibilityRole={enabled ? 'button' : undefined} accessibilityLabel={`${value}, ${label}`} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 14 }}>
      <IconChip icon={icon} />
      <View style={{ flexShrink: 1 }}>
        <AppText style={{ fontSize: 17, fontWeight: '800' }} numberOfLines={1}>{value}</AppText>
        <AppText variant="small" color="muted" numberOfLines={1}>{label}</AppText>
      </View>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: 'row', backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      {showStreak ? cell('flame', `${streak} ${streak === 1 ? 'day' : 'days'}`, 'Current streak') : null}
      {showStreak && showCheckin ? <View style={{ width: 1, backgroundColor: t.border }} /> : null}
      {showCheckin ? cell('squareCheck', `${checkinDone} of ${checkinTotal}`, 'Check-in today') : null}
    </View>
  );
}

export function FormsBanner({ count }: { count: number }) {
  const t = useTheme();
  const router = useRouter();
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={() => router.navigate('/forms')}
      accessibilityRole="button"
      accessibilityLabel={`${count} form${count === 1 ? '' : 's'} to complete. Open`}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: t.warning, backgroundColor: 'rgba(245,158,11,0.1)', borderRadius: radius.lg, paddingHorizontal: spacing.md, paddingVertical: 12 }}>
      <Icon name="clipboardList" size={18} color={t.warning} />
      <AppText style={{ flex: 1, fontWeight: '600' }}>{count} form{count === 1 ? '' : 's'} to complete</AppText>
      <AppText variant="small" color="warning" style={{ fontWeight: '800' }}>Open</AppText>
    </Pressable>
  );
}

// "Your coach asked you to check your details" (CH3). It never blocks the app: "Later" hides it for a day, and finishing the quick
// check (which clears the coach's request) removes it for good.
export function DetailsConfirmBanner({ clientId, requestedAt }: { clientId: string; requestedAt: string | null | undefined }) {
  const t = useTheme();
  const router = useRouter();
  const [hidden, setHidden] = useState(() => {
    try {
      return snoozedRecently(authStorage.getItem(detailsSnoozeKey(clientId)));
    } catch {
      return false; // storage can be blocked: show the banner rather than hide it
    }
  });
  if (!requestedAt || hidden) return null;
  const later = () => {
    try {
      authStorage.setItem(detailsSnoozeKey(clientId), String(Date.now()));
    } catch {
      // not remembered; it comes back next time the app opens
    }
    setHidden(true);
  };
  return (
    <View style={{ borderWidth: 1, borderColor: t.accentBorder, backgroundColor: t.accentSoft, borderRadius: radius.lg, padding: spacing.md, gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="clipboardList" size={18} color={t.accent} />
        <AppText style={{ flex: 1, fontWeight: '800' }}>Your coach asked you to check your details</AppText>
      </View>
      <AppText variant="small" color="muted">It takes about a minute: contact details, your goal and how you track food.</AppText>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg, marginTop: 4 }}>
        <Pressable onPress={() => router.navigate('/confirm-details')} accessibilityRole="button" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText color="accent" style={{ fontWeight: '800' }}>Update now</AppText>
        </Pressable>
        <Pressable onPress={later} accessibilityRole="button" accessibilityLabel="Remind me later" hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}>
          <AppText color="muted" style={{ fontWeight: '700' }}>Later</AppText>
        </Pressable>
      </View>
    </View>
  );
}

// Stage colours, in order: each club the member has reached keeps its colour and the stage they are in is the last one (web 1e3eba1).
// Teal comes after the three chart colours so a long run of clubs still looks distinct.
const CLUB_STAGE_COLOURS = ['#3b82f6', '#10b981', '#f59e0b'];

// One bar from 0 to the next club, split into a coloured stage per club. It never goes back to empty: passing a club leaves its stage
// full and widens the bar to the next one.
export function ClubBar({ progress }: { progress: ClubProgress }) {
  const t = useTheme();
  const colour = (i: number) => (i % 4 === 3 ? t.accent : CLUB_STAGE_COLOURS[i % 4]);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={`${progress.toGo} ${progress.toGo === 1 ? 'session' : 'sessions'} to the ${progress.next} club`}>
      <View style={{ flexDirection: 'row', gap: 3 }}>
        {progress.segments.map((s, i) => (
          <View key={s.to} style={{ flex: s.to - s.from, height: 7, borderRadius: 4, overflow: 'hidden', backgroundColor: colour(i) + '38' }}>
            <View style={{ width: `${s.fill * 100}%`, height: 7, borderRadius: 4, backgroundColor: colour(i) }} />
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row', gap: 3, marginTop: 4 }}>
        {progress.segments.map((s) => (
          <AppText key={s.to} color="muted" style={{ flex: s.to - s.from, textAlign: 'right', fontSize: 10, fontWeight: '600' }}>{s.to}</AppText>
        ))}
      </View>
    </View>
  );
}

// "Your progress": sessions attended, months a member, and the session-club bar.
export function YourProgress({ sessionsDone, club, memberMonths, nextReward }: { sessionsDone: number; club: ClubProgress; memberMonths: number | null; nextReward?: { name: string } }) {
  const t = useTheme();
  const stat = (value: React.ReactNode, label: string) => (
    <Card style={{ flex: 1, alignItems: 'center', paddingVertical: 12, paddingHorizontal: 12 }}>
      <AppText style={{ color: t.accent, fontSize: 30, fontWeight: '900', lineHeight: 34 }}>{value}</AppText>
      <AppText style={{ fontSize: 11, marginTop: 4, letterSpacing: 0.8, textTransform: 'uppercase' }} color="muted">{label}</AppText>
    </Card>
  );
  return (
    <View>
      <SectionLabel>Your progress</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {stat(sessionsDone, 'Sessions done')}
          {stat(
            memberMonths == null ? '—' : (
              <>
                {memberMonths}
                <AppText style={{ color: t.muted, fontSize: 14, fontWeight: '700' }}> mo</AppText>
              </>
            ),
            'Member for',
          )}
        </View>
        <Card style={{ paddingVertical: 12, paddingHorizontal: 14, gap: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
            <AppText variant="small" style={{ fontWeight: '700', flexShrink: 1 }}>
              {club.next} club — {club.toGo} {club.toGo === 1 ? 'session' : 'sessions'} to go
            </AppText>
            {nextReward ? <AppText variant="small" color="accent" numberOfLines={1} style={{ flexShrink: 1 }}>{nextReward.name}</AppText> : null}
          </View>
          <ClubBar progress={club} />
          {club.earned.length > 0 ? (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {club.earned.map((n) => (
                <View key={n} style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: t.accentSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3 }}>
                  <Icon name="award" size={12} color={t.accent} />
                  <AppText style={{ color: t.accentText, fontSize: 11, fontWeight: '800' }}>{n} club</AppText>
                </View>
              ))}
            </View>
          ) : null}
        </Card>
      </View>
    </View>
  );
}

// "Explore": the screens that are not tabs. Only the tiles that apply show: Resources when the coach has not switched Education off, and
// Refer a friend only when the member's gym has a referral link (web 5e2b493).
export function ExploreTiles({ education, referral = true }: { education: boolean; referral?: boolean }) {
  const router = useRouter();
  const tiles: { icon: IconName; title: string; subtitle: string; to: '/learn' | '/events' | '/rewards' | '/refer' | '/feedback' | '/faq' }[] = [
    ...(education ? [{ icon: 'circlePlay' as const, title: 'Resources', subtitle: 'Video library', to: '/learn' as const }] : []),
    { icon: 'trophy', title: 'Events', subtitle: 'Gym events', to: '/events' },
    { icon: 'gift', title: 'Rewards', subtitle: 'Gifts & clubs', to: '/rewards' },
    ...(referral ? [{ icon: 'users' as const, title: 'Refer a friend', subtitle: 'Share your link', to: '/refer' as const }] : []),
    { icon: 'star', title: 'Feedback', subtitle: 'Rate your experience', to: '/feedback' },
    { icon: 'circleHelp', title: 'FAQ', subtitle: 'Help & answers', to: '/faq' },
  ];
  const rows: (typeof tiles)[] = [];
  for (let i = 0; i < tiles.length; i += 2) rows.push(tiles.slice(i, i + 2));
  return (
    <View>
      <SectionLabel>Explore</SectionLabel>
      <View style={{ gap: spacing.sm }}>
        {rows.map((row, i) => (
          <View key={i} style={{ flexDirection: 'row', gap: spacing.sm }}>
            {row.map((tile) => <Tile key={tile.title} icon={tile.icon} title={tile.title} subtitle={tile.subtitle} onPress={() => router.navigate(tile.to)} />)}
            {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}
