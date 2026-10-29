import { useState } from 'react';
import { View } from 'react-native';

import type { EventWithSignup, RewardRow } from '@ballistic/shared/data/types';
import { eventState, rewardCaption, rewardStatus, spotsText } from '@ballistic/shared/utils/community';
import { clubBadges, clubProgress } from '@ballistic/shared/utils/clubs';

import { ClubBar } from '@/components/home';
import { Pressable } from '@/components/press';
import { Icon } from '@/components/icons';
import { AppText, Card } from '@/components/ui';
import { radius, spacing, useTheme } from '@/theme';

// One upcoming gym event: date badge, when and where, who is going, and the I'm-in / leave button.
export function EventCard({ event, now, busy, onToggle }: { event: EventWithSignup; now: Date; busy: boolean; onToggle: () => void }) {
  const t = useTheme();
  const start = new Date(event.starts_at);
  const state = eventState(event, now);
  const label = state === 'going' ? 'Going ✓ · tap to leave' : state === 'full' ? 'Full' : state === 'over' ? 'Finished' : "I'm in";
  const disabled = busy || state === 'full' || state === 'over';
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
          <AppText style={{ color: t.accentText, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{start.toLocaleDateString('en-GB', { month: 'short' })}</AppText>
          <AppText style={{ color: t.accent, fontSize: 18, fontWeight: '900', lineHeight: 20 }}>{start.getDate()}</AppText>
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={{ fontWeight: '800' }}>{event.title}</AppText>
          <AppText variant="small" color="muted">
            {start.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · {start.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true }).replace(' ', '')}
          </AppText>
          {event.location ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Icon name="mapPin" size={12} color={t.muted} />
              <AppText variant="small" color="muted">{event.location}</AppText>
            </View>
          ) : null}
          {event.description ? <AppText variant="small" color="muted" style={{ marginTop: 4 }}>{event.description}</AppText> : null}
        </View>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
          <Icon name="users" size={14} color={t.muted} />
          <AppText variant="small" color="muted">{spotsText(event)}</AppText>
        </View>
        <Pressable
          onPress={onToggle}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={`${event.title}: ${label}`}
          style={{ borderRadius: 999, paddingHorizontal: 16, paddingVertical: 8, backgroundColor: state === 'going' ? t.cardMuted : t.accent, opacity: disabled ? 0.5 : 1 }}>
          <AppText variant="small" style={{ fontWeight: '800', color: state === 'going' ? t.foreground : t.accentForeground }}>{label}</AppText>
        </Pressable>
      </View>
    </Card>
  );
}

// Five tappable stars.
export function StarRating({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const t = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Rating" style={{ flexDirection: 'row', gap: 6 }}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Pressable key={n} onPress={() => onChange(n)} accessibilityRole="radio" accessibilityState={{ checked: value === n }} aria-checked={value === n} accessibilityLabel={`${n} star${n === 1 ? '' : 's'}`} hitSlop={4}>
          <Icon name="star" size={38} color={n <= value ? '#f59e0b' : t.muted} fill={n <= value ? '#f59e0b' : 'none'} />
        </Pressable>
      ))}
    </View>
  );
}

function Bar({ pct }: { pct: number }) {
  const t = useTheme();
  return (
    <View style={{ height: 5, borderRadius: 3, backgroundColor: t.border, overflow: 'hidden' }}>
      <View style={{ height: 5, borderRadius: 3, backgroundColor: t.accent, width: `${pct}%` }} />
    </View>
  );
}

// "Session clubs": how close the member is to the next club (100, 250, 500, then every 500) and which clubs they are in.
export function ClubCard({ sessions }: { sessions: number }) {
  const t = useTheme();
  const club = clubProgress(sessions);
  const inClub = club.earned.length > 0 ? club.earned[club.earned.length - 1] : null;
  return (
    <Card style={{ gap: 6 }}>
      <AppText variant="small" color="muted" style={{ fontWeight: '800', textTransform: 'uppercase', letterSpacing: 1 }}>Session clubs</AppText>
      <AppText style={{ fontWeight: '800' }}>{inClub != null ? `You're in the ${inClub} club` : `${club.toGo} sessions to the ${club.next} club`}</AppText>
      {inClub != null ? <AppText variant="small" color="muted">{club.toGo} more session{club.toGo === 1 ? '' : 's'} to the {club.next} club</AppText> : null}
      <ClubBar progress={club} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
        {clubBadges(sessions).map(({ n, reached }) => (
          <View key={n} style={{ borderRadius: 999, paddingHorizontal: 12, paddingVertical: 4, backgroundColor: reached ? t.accent : t.cardMuted }}>
            <AppText style={{ fontSize: 11, fontWeight: '800', color: reached ? t.accentForeground : t.muted }}>{n} club</AppText>
          </View>
        ))}
      </View>
    </Card>
  );
}

// One loyalty reward with where the member is on it.
export function RewardCard({ reward, sessions, months, grantedIds }: { reward: RewardRow; sessions: number; months: number; grantedIds: string[] }) {
  const t = useTheme();
  const s = rewardStatus(reward, sessions, months, grantedIds);
  const badge = s.given ? 'Received ✓' : s.earned ? 'Earned — ask your coach' : `${s.value} of ${reward.threshold} ${s.unit}`;
  const tone = s.given ? t.success : s.earned ? t.accent : t.muted;
  return (
    <Card style={{ gap: 10 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText style={{ fontWeight: '800' }}>{reward.name}</AppText>
          <AppText variant="small" color="muted">{rewardCaption(reward)}</AppText>
        </View>
        <View style={{ borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, backgroundColor: s.given ? 'rgba(16,185,129,0.14)' : s.earned ? t.accentSoft : t.cardMuted, maxWidth: '45%' }}>
          <AppText style={{ color: tone, fontSize: 11, fontWeight: '800' }}>{badge}</AppText>
        </View>
      </View>
      {!s.earned ? <Bar pct={s.pct} /> : null}
    </Card>
  );
}

// Questions that open to show the answer.
export function FaqList({ items }: { items: { q: string; a: string }[] }) {
  const t = useTheme();
  const [open, setOpen] = useState<number | null>(null);
  return (
    <View style={{ backgroundColor: t.card, borderRadius: radius.lg, borderWidth: 1, borderColor: t.border, overflow: 'hidden' }}>
      {items.map((f, i) => (
        <View key={f.q} style={{ borderTopWidth: i === 0 ? 0 : 1, borderTopColor: t.border }}>
          <Pressable onPress={() => setOpen(open === i ? null : i)} accessibilityRole="button" accessibilityState={{ expanded: open === i }} aria-expanded={open === i} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: spacing.md, paddingVertical: 14 }}>
            <AppText style={{ flex: 1, fontWeight: '700' }}>{f.q}</AppText>
            <Icon name={open === i ? 'chevronUp' : 'chevronDown'} size={18} color={t.muted} />
          </Pressable>
          {open === i ? <AppText color="muted" style={{ paddingHorizontal: spacing.md, paddingBottom: 14 }}>{f.a}</AppText> : null}
        </View>
      ))}
    </View>
  );
}
