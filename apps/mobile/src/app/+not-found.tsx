import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText, Button, Screen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { spacing } from '@/theme';

// A link that matches no screen (an old notification, a mistyped address in the browser version) lands here
// instead of the bare "unmatched route" page.
export default function NotFound() {
  const { session } = useSession();
  return (
    <Screen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.md }}>
        <AppText variant="title">Page not found</AppText>
        <AppText color="muted">That link does not go anywhere in the app.</AppText>
        {/* Signed out, the app screens are guarded, so the way back is the sign-in screen. */}
        <Button title={session ? 'Go to the app' : 'Go to sign in'} onPress={() => router.replace(session ? '/' : '/sign-in')} />
      </View>
    </Screen>
  );
}
