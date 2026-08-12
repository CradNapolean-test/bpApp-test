import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExerciseLibrary } from '@/lib/data/exerciseLibrary';
import { getProgramTemplatesWithDays } from '@/lib/data/programTemplates';
import { getFormTemplates } from '@/lib/data/forms';
import { getCourses } from '@/lib/data/education';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
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

  const [exercises, templates, formTemplates, courses, chatOverview, groups] = await Promise.all([
    getExerciseLibrary(),
    getProgramTemplatesWithDays(),
    getFormTemplates(),
    getCourses(),
    getCoachChatOverview(),
    getGroups(),
  ]);
  const unreadCount = chatOverview.reduce((sum, c) => sum + c.unread_count, 0);

  return (
    <LibraryHubShell
      initialExercises={exercises}
      initialTemplates={templates}
      initialFormTemplates={formTemplates}
      initialCourses={courses}
      unreadCount={unreadCount}
      groups={groups}
    />
  );
}
