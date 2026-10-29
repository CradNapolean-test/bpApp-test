import { useRouter } from 'expo-router';
import { View } from 'react-native';

import type { DayTarget } from '@ballistic/shared/calculations';
import type { ClientProfileRow, DailyLogRow } from '@ballistic/shared/data/types';
import { trafficLight, type TrafficLight } from '@ballistic/shared/utils/accountability';
import { dayCaloriesOf } from '@ballistic/shared/utils/dailyLog';

import { Pressable } from '@/components/press';
import { shortDate, TargetRings } from '@/components/food';
import { Icon, type IconName } from '@/components/icons';
import { AppText, Card } from '@/components/ui';
import { PLAN_BEING_SET_UP, targetsHeldBack } from '@ballistic/shared/onboarding';
import { radius, spacing, useTheme } from '@/theme';

// "Your coach": a way to message them, with the unread count. The web shows the same: an icon tile, a line of what the chat is for,
// and a Message pill.
export function CoachCard({ name, hasCoach, unread }: { name: string; hasCoach: boolean; unread: number }) {
  const t = useTheme();
  const router = useRouter();
  return (
    <Card style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: 14 }}>
      <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: t.accentSoft, alignItems: 'center', justifyContent: 'center' }}>
        <Icon name="messageCircle" size={20} color={t.accent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <AppText style={{ fontWeight: '800', fontSize: 17 }} numberOfLines={1}>{hasCoach ? name : 'Your coach'}</AppText>
        <AppText variant="small" color="muted">Chat, voice notes &amp; photos</AppText>
      </View>
      <Pressable
        onPress={() => router.navigate('/chat')}
        accessibilityRole="button"
        accessibilityLabel={unread > 0 ? `Message, ${unread} unread` : 'Message your coach'}
        style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 38 }}>
        <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '700' }}>Message</AppText>
        {unread > 0 ? (
          <View style={{ minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center' }}>
            <AppText style={{ color: '#fff', fontSize: 10, fontWeight: '800', lineHeight: 12 }}>{unread > 9 ? '9+' : unread}</AppText>
          </View>
        ) : null}
      </Pressable>
    </Card>
  );
}

// A round count on a row ("2" forms to fill out).
export function CountBadge({ count }: { count: number }) {
  const t = useTheme();
  return (
    <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: t.danger, alignItems: 'center', justifyContent: 'center' }}>
      <AppText style={{ color: '#fff', fontSize: 12, fontWeight: '800', lineHeight: 14 }}>{count > 9 ? '9+' : count}</AppText>
    </View>
  );
}

// The tinted full-width row at the foot of a card ("Log food diary  >").
function LinkRow({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const t = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.accentSoft, borderRadius: radius.md, paddingHorizontal: 16, paddingVertical: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name={icon} size={16} color={t.accentText} />
        <AppText style={{ color: t.accentText, fontWeight: '700' }}>{label}</AppText>
      </View>
      <Icon name="chevronRight" size={16} color={t.accentText} />
    </Pressable>
  );
}

// Nutrition on the Coach tab, as on the web: the day's four rings (calories, protein, carbs, fats) against the targets, and a row
// into the food diary. A photo-diary member gets a short card about the photo diary instead.
export function NutritionBlock({ profile, todayLog, target, todayIso, onOpen }: { profile: ClientProfileRow; todayLog: DailyLogRow | undefined; target: DayTarget | null; todayIso: string; onOpen: () => void }) {
  const mode = profile.nutrition_tracking_mode;
  if (mode === 'photo_diary') {
    return (
      <Card style={{ gap: spacing.sm }}>
        <AppText style={{ fontWeight: '800' }}>Photo diary</AppText>
        <AppText variant="small" color="muted">Photograph your meals and your coach looks through them.</AppText>
        <LinkRow icon="camera" label="Open photo diary" onPress={onOpen} />
      </Card>
    );
  }
  const totals = {
    calories: todayLog ? dayCaloriesOf(todayLog) : 0, // includes Quick Adds with no macros (R11)
    protein: todayLog?.protein ?? 0,
    carbs: todayLog?.carbs ?? 0,
    fat: todayLog?.fat ?? 0,
  };
  const held = !target && targetsHeldBack(profile, false);
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: spacing.sm }}>
        <AppText style={{ fontWeight: '800' }}>Today&apos;s targets</AppText>
        <AppText variant="small" color="muted">{shortDate(todayIso)}</AppText>
      </View>
      <TargetRings totals={totals} target={target} />
      {!target ? <AppText variant="small" color="muted">{held ? `${PLAN_BEING_SET_UP}. Your targets appear once they have been checked.` : 'Finish setup to see your targets.'}</AppText> : null}
      <LinkRow icon="notebookPen" label={mode === 'manual_import' ? 'Log your macros' : 'Log food diary'} onPress={onOpen} />
    </Card>
  );
}

function lightColor(t: ReturnType<typeof useTheme>, light: TrafficLight): string {
  return light === 'green' ? t.success : light === 'amber' ? t.warning : t.danger;
}

// Today's sleep, steps and water, each in its green / amber / red, under a "Log today" pill (the web's daily check-in card).
export function CheckinTiles({ todayLog }: { todayLog: DailyLogRow | undefined }) {
  const t = useTheme();
  const router = useRouter();
  const tiles = [
    { label: 'Sleep', metric: 'sleep' as const, value: todayLog?.sleep ?? null, text: (v: number) => `${v}h` },
    { label: 'Steps', metric: 'steps' as const, value: todayLog?.steps ?? null, text: (v: number) => v.toLocaleString('en-GB') },
    { label: 'Water', metric: 'water' as const, value: todayLog?.water ?? null, text: (v: number) => `${v}L` },
  ];
  return (
    <Card style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText style={{ fontWeight: '800' }}>Today</AppText>
        <Pressable onPress={() => router.navigate('/checkin')} accessibilityRole="button" style={{ backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 16, height: 34, justifyContent: 'center' }}>
          <AppText variant="small" style={{ color: t.accentForeground, fontWeight: '700' }}>Log today</AppText>
        </Pressable>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {tiles.map((tile) => {
          const light = tile.value == null ? null : trafficLight(tile.metric, tile.value);
          return (
            <View key={tile.label} style={{ flex: 1, backgroundColor: t.cardMuted, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 8, alignItems: 'center' }}>
              <AppText maxFontSizeMultiplier={1.2} style={{ fontSize: 18, fontWeight: '900', color: light ? lightColor(t, light) : t.muted }} accessibilityLabel={`${tile.label} ${tile.value == null ? 'not logged' : tile.text(tile.value)}`}>
                {tile.value == null ? '—' : tile.text(tile.value)}
              </AppText>
              <AppText maxFontSizeMultiplier={1.2} style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, color: t.muted, marginTop: 6 }}>{tile.label}</AppText>
            </View>
          );
        })}
      </View>
    </Card>
  );
}
