import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerGyms, getOwnerGymStats, getOwnerOrganisationName } from '@/lib/data/owner';
import { OwnerShell } from './_components/OwnerShell';

export default async function OwnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'owner') redirect('/');

  // A failed read is not "owner access is not set up": the screen says it could not load and offers Try again, and the reason goes to Sentry (R30).
  const [gyms, stats, orgName] = await Promise.all([getOwnerGyms(), getOwnerGymStats(), getOwnerOrganisationName()]);

  return (
    <OwnerShell
      gyms={gyms.ok ? gyms.data : null}
      stats={stats.ok ? stats.data : null}
      email={profile.email ?? user.email ?? 'Owner'}
      orgName={orgName}
    />
  );
}
