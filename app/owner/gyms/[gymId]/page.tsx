import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerGymSettings, getOwnerGyms, getOwnerOrganisationName } from '@/lib/data/owner';
import { parseRosterFilter } from '@/lib/ownerRoster';
import { OwnerGymShell } from '../../_components/OwnerGymShell';

// One gym in the owner's organisation: its members (read only), its coaches and its settings (R37). The page checks the signed-in person is
// the owner and the gym is one of the organisation's; the database functions behind every action check it again.
export default async function OwnerGymPage({
  params,
  searchParams,
}: {
  params: Promise<{ gymId: string }>;
  searchParams: Promise<{ filter?: string | string[] }>;
}) {
  const { gymId } = await params;
  const { filter } = await searchParams;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'owner') redirect('/');

  const [gyms, settings, orgName] = await Promise.all([getOwnerGyms(), getOwnerGymSettings(gymId), getOwnerOrganisationName()]);

  // A gym that is not in this organisation's list is not found, whatever the address says.
  const gym = gyms.ok ? gyms.data.find((g) => g.id === gymId) : undefined;
  if (gyms.ok && !gym) notFound();

  return (
    <OwnerGymShell
      gymId={gymId}
      gym={gym ?? null}
      siblingNames={gyms.ok ? gyms.data.map((g) => g.name) : []}
      settings={settings}
      orgName={orgName}
      email={profile.email ?? user.email ?? 'Owner'}
      ownerId={user.id}
      initialFilter={parseRosterFilter(filter)}
    />
  );
}
