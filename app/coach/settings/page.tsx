import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGymRoster } from '@/lib/data/gym';
import { CoachSettingsShell } from './_components/CoachSettingsShell';

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, theme_preference, display_name, default_checkin_reminder_days, is_gym_admin, gym:gym_id(name)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  const [chatOverview, gymRoster] = await Promise.all([
    getCoachChatOverview(),
    profile.is_gym_admin ? getGymRoster() : Promise.resolve([]),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <CoachSettingsShell
      email={user.email ?? ''}
      themePreference={(profile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
      displayName={profile.display_name}
      defaultCheckinReminderDays={profile.default_checkin_reminder_days}
      unreadCount={unreadCount}
      isGymAdmin={profile.is_gym_admin}
      gymName={gym?.name ?? ''}
      gymRoster={gymRoster}
      currentUserId={user.id}
    />
  );
}
