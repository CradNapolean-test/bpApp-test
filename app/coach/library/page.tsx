import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getCoachUnreadTotal } from '@/lib/data/coach';
import { readLibrarySummary, readLibraryTab } from '@/lib/data/libraryTabs';
import { parseLibraryTab } from '@/lib/libraryTabs';
import { LibraryHubShell } from './_components/LibraryHubShell';

// Loads the tiles' counts and only the tab that opens (?tab=..., Exercises when none): each other tab's data is fetched the first time
// it is opened (LB25). A save's refresh redraws this for the tab in the address, which is the open one.
export default async function CoachLibraryPage({ searchParams }: { searchParams: Promise<{ tab?: string | string[] }> }) {
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

  const tab = parseLibraryTab((await searchParams).tab);
  const [unreadCount, summary, tabData] = await Promise.all([
    getCoachUnreadTotal(supabase),
    readLibrarySummary(supabase),
    readLibraryTab(supabase, user.id, tab),
  ]);

  return <LibraryHubShell initialTab={tabData} summary={summary} unreadCount={unreadCount} email={user.email ?? 'Coach'} />;
}
