import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachChatOverview } from '@/lib/data/chat';
import { CoachSettingsShell } from './_components/CoachSettingsShell';

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, theme_preference, display_name, default_checkin_reminder_days')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const chatOverview = await getCoachChatOverview();
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <CoachSettingsShell
      email={user.email ?? ''}
      themePreference={(profile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
      displayName={profile.display_name}
      defaultCheckinReminderDays={profile.default_checkin_reminder_days}
      unreadCount={unreadCount}
    />
  );
}
