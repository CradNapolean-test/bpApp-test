import { useEffect, useState } from 'react';
import { View } from 'react-native';

import { syncBanner } from '@ballistic/shared/utils/syncStatus';

import { Pressable } from '@/components/press';
import { AppText, ConfirmSheet } from '@/components/ui';
import { checkConnectionNow, useIsOnline } from '@/lib/connectivity';
import { useSession } from '@/lib/session';
import { dismissFailedWrites, useFailedWrites } from '@/lib/syncState';
import { useWaitingWrites } from '@/lib/writeQueue';
import { spacing, useTheme } from '@/theme';

// true once `active` has been true for `delayMs` without a break (and false at once when it stops).
function useAfterDelay(active: boolean, delayMs: number) {
  const [elapsed, setElapsed] = useState(false);
  useEffect(() => {
    if (!active) return;
    const id = setTimeout(() => setElapsed(true), delayMs);
    return () => {
      clearTimeout(id);
      setElapsed(false);
    };
  }, [active, delayMs]);
  return active && elapsed;
}

// The one line under the header: offline, writes waiting to be saved, or a change the server refused. Silent when all is well.
// "Saving..." only appears if saving takes a moment, so an ordinary tap does not flash a banner.
export function SyncStrip() {
  const t = useTheme();
  const online = useIsOnline();
  const waiting = useWaitingWrites();
  const failed = useFailedWrites();
  const slow = useAfterDelay(online && waiting > 0, 1500);

  const banner = syncBanner({ online, waiting: online && !slow ? 0 : waiting, failed });
  if (!banner) return null;
  const color = banner.tone === 'problem' ? t.danger : banner.tone === 'offline' ? t.warning : t.muted;
  const action = banner.tone === 'problem' ? { label: 'Dismiss', run: dismissFailedWrites } : banner.tone === 'offline' ? { label: 'Try again', run: () => void checkConnectionNow() } : null;

  return (
    <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: 16, paddingBottom: 8 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />
      <AppText variant="small" style={{ flex: 1, color }} accessibilityLiveRegion="polite">
        {banner.text}
      </AppText>
      {action ? (
        <Pressable onPress={action.run} accessibilityRole="button" hitSlop={8}>
          <AppText variant="small" color="accent" style={{ fontWeight: '700' }}>{action.label}</AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

// Signing out removes everything saved on the phone, including changes still waiting to be saved, so ask first if there are any.
export function useSignOutGuard() {
  const { signOut } = useSession();
  const waiting = useWaitingWrites();
  const [asking, setAsking] = useState(false);
  const request = () => {
    if (waiting > 0) setAsking(true);
    else void signOut();
  };
  const sheet = asking ? (
    <ConfirmSheet
      title="Sign out without saving?"
      body={`${waiting === 1 ? '1 change has' : `${waiting} changes have`} not been saved yet because the phone is offline. If you sign out now, ${waiting === 1 ? 'it is' : 'they are'} lost.`}
      confirmLabel="Sign out anyway"
      onCancel={() => setAsking(false)}
      onConfirm={() => {
        setAsking(false);
        void signOut();
      }}
    />
  ) : null;
  return { request, sheet };
}
