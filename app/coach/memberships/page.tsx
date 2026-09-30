import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCreditPacks, getPackages } from '@/lib/data/memberships';
import { getCoachChatOverview } from '@/lib/data/chat';
import { MembershipsShell } from './_components/MembershipsShell';

export default async function CoachMembershipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [packages, creditPacks, chatOverview] = await Promise.all([getPackages(), getCreditPacks(), getCoachChatOverview()]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <MembershipsShell
      initialPackages={packages}
      initialCreditPacks={creditPacks}
      unreadCount={unreadCount}
      email={user.email ?? 'Coach'}
    />
  );
}
