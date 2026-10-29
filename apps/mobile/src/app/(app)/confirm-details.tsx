import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { OnboardingDone, OnboardingFlow } from '@/components/onboarding';
import { AppText, Button, Screen } from '@/components/ui';
import { useClientProfile } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { spacing, useTheme } from '@/theme';

// The quick details check a coach can ask for (CH3), opened from the banner on Home. It is the short onboarding: contact details,
// goal and how the member tracks food (plus height and weight if their profile has none). Finishing it clears the coach's request.
export default function ConfirmDetails() {
  const t = useTheme();
  const router = useRouter();
  const me = useMe().data;
  const q = useClientProfile();
  const [finished, setFinished] = useState<{ firstName: string; short: boolean } | null>(null);
  const coachFirstName = me?.coachName?.trim().split(/\s+/)[0] ?? null;

  if (finished) {
    return <OnboardingDone firstName={finished.firstName} short coachFirstName={coachFirstName} onContinue={() => router.replace('/')} />;
  }
  if (q.isPending) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (!q.data) {
    return (
      <Screen style={{ justifyContent: 'center', gap: spacing.md }}>
        <AppText color="muted">We could not load your details. Check your connection and try again.</AppText>
        <Button title="Try again" onPress={() => q.refetch()} />
      </Screen>
    );
  }
  return <OnboardingFlow email={me?.email ?? ''} coachFirstName={coachFirstName} existing={q.data} onFinished={setFinished} />;
}
