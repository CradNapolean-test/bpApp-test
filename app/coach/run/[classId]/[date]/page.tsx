import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRunClassData } from '@/lib/data/runClass';
import { RunClassView } from './RunClassView';

export default async function RunClassPage({ params }: { params: Promise<{ classId: string; date: string }> }) {
  const { classId, date } = await params;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  const data = await getRunClassData(classId, date).catch(() => null);
  if (!data) notFound();

  return <RunClassView classId={classId} initial={data} />;
}
