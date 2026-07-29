import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getFormTemplates } from '@/lib/data/forms';
import { FormsHubShell } from './_components/FormsHubShell';

export default async function CoachFormsPage() {
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

  const templates = await getFormTemplates();

  return <FormsHubShell initialTemplates={templates} />;
}
