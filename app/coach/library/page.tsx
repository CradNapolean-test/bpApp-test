import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getExerciseLibrary } from '@/lib/data/exerciseLibrary';
import { getProgramTemplatesWithDays } from '@/lib/data/programTemplates';
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

  const [exercises, templates] = await Promise.all([getExerciseLibrary(), getProgramTemplatesWithDays()]);

  return <LibraryHubShell initialExercises={exercises} initialTemplates={templates} />;
}
