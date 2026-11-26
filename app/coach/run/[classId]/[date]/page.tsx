import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getRunClassData } from '@/lib/data/runClass';
import { isRunClassDate, runClassTimeZone } from './runClassPage';
import { RunClassView } from './RunClassView';

export default async function RunClassPage({ params }: { params: Promise<{ classId: string; date: string }> }) {
  const { classId, date } = await params;

  // Who is asking comes first (SE15): a member is sent to their dashboard whatever the address says, never shown the coach's page
  // furniture around a "not found".
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') redirect('/dashboard');

  if (!isRunClassDate(date)) notFound();
  const [data, timezone] = await Promise.all([getRunClassData(classId, date).catch(() => null), runClassTimeZone(supabase, classId)]);
  if (!data) notFound();

  return <RunClassView classId={classId} initial={data} timezone={timezone} />;
}
