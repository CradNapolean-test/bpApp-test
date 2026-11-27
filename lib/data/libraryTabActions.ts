'use server';

import { createClient } from '@/lib/supabase/server';
import { isLibraryTab } from '@/lib/libraryTabs';
import { readLibraryTab, type LibraryTabData } from './libraryTabs';

// What the Library fetches the first time a tab other than the opening one is opened (LB25). The same checks as the page itself: a
// signed-in coach, or nothing. The tab name comes from the browser, so anything that isn't one of the five tabs is refused. The data is
// read with the coach's own session, so the database's rules decide what is in it, exactly as on the page.
export async function loadLibraryTab(tab: string): Promise<{ ok: true; data: LibraryTabData } | { ok: false }> {
  if (!isLibraryTab(tab)) return { ok: false };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false };
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'coach') return { ok: false };
  return { ok: true, data: await readLibraryTab(supabase, user.id, tab) };
}
