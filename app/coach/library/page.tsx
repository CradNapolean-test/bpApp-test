import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExerciseLibrary, getExerciseUsage } from '@/lib/data/exerciseLibrary';
import { getPendingRollouts, getProgramTemplatesWithDays } from '@/lib/data/programTemplates';
import { getFormTemplates } from '@/lib/data/forms';
import { getCourseRollup, getCourses } from '@/lib/data/education';
import { getCoachChatOverview } from '@/lib/data/chat';
import { getGroups } from '@/lib/data/clientGroups';
import { getMyGyms } from '@/lib/data/gym';
import { getMyClients } from '@/lib/data/coach';
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

  const [exercises, templates, formTemplates, courses, chatOverview, groups, myClients, rollouts, exerciseUsage, courseRollup, myGyms] = await Promise.all([
    getExerciseLibrary(),
    getProgramTemplatesWithDays(),
    getFormTemplates(),
    getCourses(),
    getCoachChatOverview(),
    getGroups(),
    getMyClients(supabase, user.id),
    getPendingRollouts(),
    getExerciseUsage(),
    getCourseRollup(),
    getMyGyms().catch(() => []),
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
      rollouts={rollouts}
      exerciseUsage={exerciseUsage}
      courseRollup={courseRollup}
      otherGyms={myGyms.filter((g) => !g.isActive).map((g) => ({ id: g.gymId, name: g.gymName }))}
      members={myClients.map((c) => ({ id: c.id, name: c.name ?? c.email }))}
      email={user.email ?? 'Coach'}
    />
  );
}
