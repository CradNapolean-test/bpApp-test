import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExerciseLibrary } from '@/lib/data/exerciseLibrary';
import { getProgramTemplatesWithDays } from '@/lib/data/programTemplates';
import { getCoachChatOverview } from '@/lib/data/chat';
import { LibraryHubShell } from './_components/LibraryHubShell';

export default async function CoachLibraryPage() {
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

  const [exercises, templates, chatOverview] = await Promise.all([
    getExerciseLibrary(),
    getProgramTemplatesWithDays(),
    getCoachChatOverview(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return <LibraryHubShell initialExercises={exercises} initialTemplates={templates} unreadCount={unreadCount} />;
}
