import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachUnreadTotal } from '@/lib/data/coach';
import { getGymRoster, getMyGyms } from '@/lib/data/gym';
import { CoachSettingsShell } from './_components/CoachSettingsShell';

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, theme_preference, display_name, default_checkin_reminder_days, is_gym_admin, gym:gym_id(name, timezone, blackout_start, blackout_end)')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');
  const gym = Array.isArray(profile.gym) ? profile.gym[0] : profile.gym;

  const [unreadCount, gymRoster, myGyms] = await Promise.all([
    getCoachUnreadTotal(supabase),
    profile.is_gym_admin ? getGymRoster() : Promise.resolve([]),
    getMyGyms(),
  ]);

  return (
    <CoachSettingsShell
      email={user.email ?? ''}
      themePreference={(profile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
      displayName={profile.display_name}
      defaultCheckinReminderDays={profile.default_checkin_reminder_days}
      unreadCount={unreadCount}
      isGymAdmin={profile.is_gym_admin}
      gymName={gym?.name ?? ''}
      gymTimezone={gym?.timezone ?? 'UTC'}
      blackoutStart={gym?.blackout_start ?? null}
      blackoutEnd={gym?.blackout_end ?? null}
      gymRoster={gymRoster}
      myGyms={myGyms}
      currentUserId={user.id}
    />
  );
}
