import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getOwnerGyms } from '@/lib/data/owner';
import { OwnerShell } from './_components/OwnerShell';

export default async function OwnerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role, email').eq('id', user.id).maybeSingle();
  if (!profile || profile.role !== 'owner') redirect('/');

  const gyms = await getOwnerGyms().catch(() => null);

  return <OwnerShell gyms={gyms} email={profile.email ?? user.email ?? 'Owner'} />;
}
