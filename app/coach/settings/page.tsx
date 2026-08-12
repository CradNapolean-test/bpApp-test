import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { CoachSettingsShell } from './_components/CoachSettingsShell';

export default async function CoachSettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, theme_preference')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  return (
    <CoachSettingsShell
      email={user.email ?? ''}
      themePreference={(profile.theme_preference as 'light' | 'dark' | 'system') ?? 'system'}
    />
  );
}
