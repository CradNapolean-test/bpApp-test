import { useIsRestoring } from '@tanstack/react-query';
import { Tabs } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';

import { BottomTabs, renderHeader } from '@/components/nav';
import { OnboardingDone, OnboardingFlow } from '@/components/onboarding';
import { InTabsContext, Screen } from '@/components/ui';
import { useThemeSync } from '@/lib/account';
import { useChatRealtime, useChatUnread, useOwnUserId } from '@/lib/chat';
import { useOnboardingGate } from '@/lib/details';
import { useUnreadNotifications } from '@/lib/notifications';
import { useBadgeSync, usePushRefresh, usePushRouting } from '@/lib/push';
import { useClientProfile } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { resumeQueuedWrites } from '@/lib/writeQueue';
import { useTheme } from '@/theme';

// The frame matches the web app: four tabs (Home / Book / Coach / Profile) and one header, both drawn in
// components/nav.tsx. The screens below the four (food, workouts, chat, ...) are registered here only so they have a
// title for the header; they are opened from a tab's page, and the tab they belong to stays lit (see TAB_OF in nav.tsx).
// Whether a screen is shown to this member at all (coach switches, membership tier) is decided where it is linked from.
// A member who has not onboarded yet (or whom the coach asked to confirm their details) sees the questions instead of the
// tabs; nothing else is reachable until they are done.
// Marks every screen between the header and the tab bar, so Screen / ScrollScreen leave the notch and home-bar space to those two.
const inTabs = ({ children }: { children: React.ReactElement }) => <InTabsContext.Provider value>{children}</InTabsContext.Provider>;

export default function AppLayout() {
  const t = useTheme();
  const clientId = useOwnUserId();
  useThemeSync(); // the saved Light / Dark / System choice comes down from the profile on a new phone
  // Writes that were still waiting to be saved when the app was last closed come back with the saved cache; once it is
  // restored and the member is signed in (this layout only exists then), they are carried on from where they stopped.
  const restoring = useIsRestoring();
  useEffect(() => {
    if (!restoring) resumeQueuedWrites();
  }, [restoring]);
  // One live connection for the whole app; the header and the Coach tab count the coach's unread messages.
  useChatRealtime(clientId);
  // The header badges are checked once when the app opens; the screens' headers then just read the cached counts.
  const unreadChat = useChatUnread(clientId, true).data ?? 0;
  const unreadNotes = useUnreadNotifications(true).data ?? 0;
  // Push: a tapped notification opens its screen, the app icon shows what is unread, this phone's registration is refreshed.
  usePushRouting();
  usePushRefresh();
  useBadgeSync(unreadChat + unreadNotes);

  const me = useMe().data;
  const profileQ = useClientProfile();
  const gate = useOnboardingGate(me?.role === 'client');
  const [finished, setFinished] = useState<{ firstName: string; short: boolean } | null>(null);
  const coachFirstName = me?.coachName?.trim().split(/\s+/)[0] ?? null;

  if (finished) {
    return <OnboardingDone firstName={finished.firstName} short={finished.short} coachFirstName={coachFirstName} onContinue={() => setFinished(null)} />;
  }
  // "Not yet" is only trusted once it is a fresh answer; the short version also needs the profile it fills in from.
  if (gate.status === 'loading' || (gate.status === 'needed' && gate.hasProfile && profileQ.isPending)) {
    return (
      <Screen style={{ justifyContent: 'center' }}>
        <ActivityIndicator color={t.accent} />
      </Screen>
    );
  }
  if (gate.status === 'needed') {
    return (
      <OnboardingFlow
        email={me?.email ?? ''}
        coachFirstName={coachFirstName}
        existing={gate.hasProfile ? profileQ.data ?? null : null}
        onFinished={setFinished}
      />
    );
  }

  return (
    <Tabs tabBar={(props) => <BottomTabs {...props} />} backBehavior="history" screenOptions={{ header: renderHeader }} screenLayout={inTabs}>
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="classes" options={{ title: 'Book a session' }} />
      <Tabs.Screen name="coach" options={{ title: 'My coaching' }} />
      <Tabs.Screen name="account" options={{ title: 'Profile' }} />

      <Tabs.Screen name="food" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="workouts" options={{ title: 'Training' }} />
      <Tabs.Screen name="workout/[dayId]" options={{ title: 'Workout' }} />
      <Tabs.Screen name="chat" options={{ title: 'Your coach' }} />
      <Tabs.Screen name="progress" options={{ title: 'Progress & results' }} />
      <Tabs.Screen name="checkin" options={{ title: 'Check-in' }} />
      <Tabs.Screen name="forms" options={{ title: 'Check-in' }} />
      <Tabs.Screen name="form/[assignmentId]" options={{ title: 'Form' }} />
      <Tabs.Screen name="details" options={{ title: 'Personal details' }} />
      <Tabs.Screen name="confirm-details" options={{ title: 'Check your details' }} />
      <Tabs.Screen name="recipes" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="meal-plan" options={{ title: 'Nutrition' }} />
      <Tabs.Screen name="activity" options={{ title: 'Training' }} />
      <Tabs.Screen name="bigdog" options={{ title: 'Big Dog standards' }} />
      <Tabs.Screen name="learn" options={{ title: 'Learn' }} />
      <Tabs.Screen name="course/[assignmentId]" options={{ title: 'Course' }} />
      <Tabs.Screen name="events" options={{ title: 'Events' }} />
      <Tabs.Screen name="feedback" options={{ title: 'Feedback' }} />
      <Tabs.Screen name="refer" options={{ title: 'Refer a friend' }} />
      <Tabs.Screen name="rewards" options={{ title: 'Rewards & clubs' }} />
      <Tabs.Screen name="faq" options={{ title: 'FAQs & help' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Notifications' }} />
      <Tabs.Screen name="credits" options={{ title: 'Credits & membership' }} />
    </Tabs>
  );
}
