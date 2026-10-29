import { useState } from 'react';
import { View } from 'react-native';

import { SwitchRow } from '@/components/account';
import { Icon } from '@/components/icons';
import { AppText, Card, ListRow, SmallButton } from '@/components/ui';
import { usePushControls } from '@/lib/push';
import { dismissPushCard, isPushCardDismissed, openPhoneSettings } from '@/lib/pushDevice';
import { spacing, useTheme } from '@/theme';

type Controls = ReturnType<typeof usePushControls>;

// Whether the Profile screen has a push row to show at all (not in the browser, and not until it is known).
export const hasPushRow = (status: Controls['status']) => status !== undefined && status !== 'unsupported';

// The "Push notifications" row in Profile > Notifications.
export function PushSettingRow({ controls }: { controls: Controls }) {
  const { status, busy, error, enable, disable } = controls;
  if (status === 'unavailable') return <ListRow title="Push notifications" subtitle="Not set up in this version of the app yet" />;
  if (status === 'denied') {
    return <ListRow title="Push notifications" subtitle="Off in your phone's settings. Tap to open them." onPress={() => void openPhoneSettings()} />;
  }
  return (
    <View>
      <SwitchRow
        title="Push notifications"
        subtitle={status === 'on' ? 'Coach messages, feedback and reminders on this phone' : 'Get a notification when your coach messages you'}
        value={status === 'on'}
        onChange={(next) => {
          if (busy) return;
          if (next) enable();
          else disable();
        }}
      />
      {error ? <AppText variant="small" color="danger" style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.sm }}>Could not change that: {error}</AppText> : null}
    </View>
  );
}

// On Home until the member has turned notifications on or said "Not now": the phone only asks permission once, so the app asks
// first, in its own words, at a moment the member chose.
export function PushCard() {
  const t = useTheme();
  const { status, busy, error, enable } = usePushControls();
  const [dismissed, setDismissed] = useState(isPushCardDismissed);
  if (dismissed || (status !== 'undetermined' && status !== 'off')) return null;
  return (
    <Card style={{ gap: spacing.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
        <Icon name="bell" size={18} color={t.accent} />
        <AppText style={{ fontWeight: '700', flex: 1 }}>Never miss a message from your coach</AppText>
      </View>
      <AppText variant="small" color="muted">Turn on notifications to hear about coach messages, feedback and check-in reminders.</AppText>
      {error ? <AppText variant="small" color="danger">{error}</AppText> : null}
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <SmallButton title={busy ? 'Turning on...' : 'Turn on'} onPress={enable} disabled={busy} />
        <SmallButton
          title="Not now"
          tone="muted"
          onPress={() => {
            dismissPushCard();
            setDismissed(true);
          }}
        />
      </View>
    </Card>
  );
}
