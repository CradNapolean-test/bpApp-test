import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerOrganisationName } from '@/lib/data/owner';
import { OwnerAccountShell } from '../_components/OwnerAccountShell';
import type { ThemePreference } from '@/app/_components/theme';

// The owner's own account: change password and email, theme, sign out (R37). Owners only.
export default async function OwnerAccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, email, theme_preference').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'owner') redirect('/');

  const orgName = await getOwnerOrganisationName();

  return (
    <OwnerAccountShell
      email={profile.email ?? user.email ?? 'Owner'}
      themePreference={(profile.theme_preference as ThemePreference | null) ?? 'system'}
      orgName={orgName}
    />
  );
}
