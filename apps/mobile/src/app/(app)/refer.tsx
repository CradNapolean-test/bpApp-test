import * as WebBrowser from 'expo-web-browser';
import { Share, View } from 'react-native';

import { referMessage } from '@ballistic/shared/utils/community';

import { Icon } from '@/components/icons';
import { AppText, Button, Card, ScrollScreen } from '@/components/ui';
import { useGymReferralUrl } from '@/lib/community';
import { useClientProfile } from '@/lib/today';
import { spacing, useTheme } from '@/theme';

// Refer a friend: a ready-written message with the link of the member's own gym (its referral page, where the discount is already applied).
// A gym with no link has nothing to share, so the Home tile is left out and this says so.
export default function Refer() {
  const t = useTheme();
  const profile = useClientProfile().data;
  const { url, ready } = useGymReferralUrl();
  const message = url ? referMessage(profile?.name, url) : '';

  async function share() {
    try {
      await Share.share({ message, title: 'Ballistic Performance' });
    } catch {
      // closed without sharing, or this browser cannot share: the message above can be copied by hand
    }
  }

  if (ready && !url) {
    return (
      <ScrollScreen>
        <Card style={{ gap: spacing.xs }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>Refer a friend</AppText>
          <AppText color="muted">Your gym has not set up a referral link yet. Ask your coach.</AppText>
        </Card>
      </ScrollScreen>
    );
  }
  if (!ready || !url) {
    return (
      <ScrollScreen>
        <AppText color="muted">Loading…</AppText>
      </ScrollScreen>
    );
  }

  return (
    <ScrollScreen>
      <Card style={{ gap: spacing.md }}>
        <View style={{ gap: 2 }}>
          <AppText style={{ fontWeight: '800', fontSize: 17 }}>Refer a friend or family member</AppText>
          <AppText variant="small" color="muted">Send them your link. Their discount off the 6 week challenge is already applied when they sign up through it.</AppText>
        </View>
        <View style={{ backgroundColor: t.cardMuted, borderRadius: 12, padding: 12 }}>
          <AppText variant="small" color="muted" selectable>{message}</AppText>
        </View>
        <Button title="Share" onPress={share} />
        <Button title="Open the referral page" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(url)} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, justifyContent: 'center' }}>
          <Icon name="externalLink" size={12} color={t.muted} />
          <AppText variant="small" color="muted">{url.replace('https://', '')}</AppText>
        </View>
      </Card>
    </ScrollScreen>
  );
}
