import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getEducationContent } from '@/lib/data/education';
import { getCoachChatOverview } from '@/lib/data/chat';
import { EducationHubShell } from './_components/EducationHubShell';

export default async function CoachEducationPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const [content, chatOverview] = await Promise.all([getEducationContent(), getCoachChatOverview()]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return <EducationHubShell initialContent={content} unreadCount={unreadCount} />;
}
