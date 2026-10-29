import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { bigDogCount } from '@ballistic/shared/bigDog';
import { longDate } from '@ballistic/shared/utils/progress';

import { ChangeEmailForm, ChangePasswordForm, DeletionCard, InfoCard, ProfileHeader, SectionHeader, SwitchRow, ThemeChoice } from '@/components/account';
import { BigDogCard } from '@/components/bigdog';
import { hasPushRow, PushSettingRow } from '@/components/push';
import { useSignOutGuard } from '@/components/sync';
import { AppText, ListGroup, ListRow, ScrollScreen, SectionLabel } from '@/components/ui';
import { useGymName, useUpdateProfileSetting } from '@/lib/account';
import { useBigDogResults } from '@/lib/bigDog';
import { useUnreadNotifications } from '@/lib/notifications';
import { usePushControls } from '@/lib/push';
import { useSession } from '@/lib/session';
import { useClientProfile, useCredits } from '@/lib/today';
import { useMe } from '@/lib/useMe';
import { spacing, useThemePreference } from '@/theme';

type OpenRow = 'password' | 'email' | null;

// The member's profile, laid out like the BP profile mockup: who they are, where they stand in Big Dog, their details, then the
// settings in small groups.
export default function Account() {
  const router = useRouter();
  const { session } = useSession();
  const signOutGuard = useSignOutGuard();
  const push = usePushControls();
  const me = useMe().data;
  const profile = useClientProfile().data ?? null;
  const credits = useCredits().data;
  const gym = useGymName(me?.gymId).data ?? null;
  const bigDog = useBigDogResults();
  const unread = useUnreadNotifications().data ?? 0;
  const themePreference = useThemePreference();
  const setting = useUpdateProfileSetting();
  const [openRow, setOpenRow] = useState<OpenRow>(null);

  const email = session?.user.email ?? '';
  const name = profile?.name?.trim() || email;
  const membership = credits?.membership ?? null;
  const plan = membership?.package?.name ?? null;
  const planLine = plan ? (membership?.scheduled_end ? `${plan} — ends ${longDate(membership.scheduled_end)}` : plan) : null;
  const pill = [plan, gym].filter(Boolean).join(' · ') || null;
  const details = [
    profile?.date_of_birth ? { label: 'Date of birth', value: longDate(profile.date_of_birth) } : null,
    profile?.phone ? { label: 'Phone', value: profile.phone } : null,
    planLine ? { label: 'Membership', value: planLine } : null,
    gym ? { label: 'Site', value: gym } : null,
  ].filter((r): r is { label: string; value: string } => r !== null);
  const deletionRequested = profile?.deletion_requested_at != null;

  return (
    <ScrollScreen>
      <ProfileHeader name={name} email={email} pill={pill} />

      {bigDog.isSuccess ? <BigDogCard count={bigDogCount(bigDog.data)} onPress={() => router.navigate('/bigdog')} /> : null}

      <View>
        <SectionHeader title="My details" action={{ label: 'Edit', onPress: () => router.navigate('/details') }} />
        {details.length > 0 ? (
          <InfoCard rows={details} />
        ) : (
          <ListGroup>
            <View style={{ padding: spacing.md }}>
              <AppText color="muted">Nothing added yet. Tap Edit to add your details, goal and weights.</AppText>
            </View>
          </ListGroup>
        )}
      </View>

      <View>
        <SectionLabel>My account</SectionLabel>
        <ListGroup>
          <ListRow icon="bell" tone="neutral" title="Notifications" subtitle={unread > 0 ? `${unread} new` : 'You’re all caught up'} onPress={() => router.navigate('/notifications')} />
          <ListRow icon="wallet" title="Credits & membership" subtitle="Balance, history and your plan" onPress={() => router.navigate('/credits')} />
          <ListRow icon="lock" tone="neutral" title="Change password" onPress={() => setOpenRow(openRow === 'password' ? null : 'password')} />
          {openRow === 'password' ? <ChangePasswordForm /> : null}
          <ListRow icon="mail" tone="neutral" title="Change email" onPress={() => setOpenRow(openRow === 'email' ? null : 'email')} />
          {openRow === 'email' ? <ChangeEmailForm currentEmail={email} /> : null}
        </ListGroup>
      </View>

      <View>
        <SectionLabel>Notifications</SectionLabel>
        <ListGroup>
          {hasPushRow(push.status) ? <PushSettingRow controls={push} /> : null}
          <SwitchRow
            title="Check-in reminders"
            value={profile?.notifications_enabled ?? true}
            onChange={(next) => setting.mutate({ notifications_enabled: next })}
          />
          <SwitchRow
            title="Email notifications"
            subtitle="Messages your coach sends by email"
            value={profile?.email_notifications_enabled ?? true}
            onChange={(next) => setting.mutate({ email_notifications_enabled: next })}
          />
        </ListGroup>
        {setting.isError ? <AppText variant="small" color="danger" style={{ marginTop: 6 }}>Could not save that setting: {setting.error.message}</AppText> : null}
      </View>

      <View>
        <SectionLabel>Appearance</SectionLabel>
        <ThemeChoice value={themePreference} />
      </View>

      <View>
        <SectionLabel>Help</SectionLabel>
        <ListGroup>
          <ListRow icon="circleHelp" title="FAQs" subtitle="Common questions answered" onPress={() => router.navigate('/faq')} />
          <ListRow icon="messageCircle" title="Message your coach" onPress={() => router.navigate('/chat')} />
        </ListGroup>
      </View>

      <ListGroup>
        <ListRow icon="logOut" tone="danger" title="Log out" onPress={signOutGuard.request} />
      </ListGroup>
      {signOutGuard.sheet}

      <DeletionCard
        requested={deletionRequested}
        busy={setting.isPending}
        error={null}
        onRequest={() => setting.mutate({ deletion_requested_at: new Date().toISOString() })}
        onCancel={() => setting.mutate({ deletion_requested_at: null })}
      />
    </ScrollScreen>
  );
}
