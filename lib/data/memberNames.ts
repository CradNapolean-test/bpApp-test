import type { SupabaseClient } from '@supabase/supabase-js';

// Names of members by id, for the Library's "who has this form / course" lists, which can include members of other coaches at the gym.
// Only the names the signed-in coach may read come back (profiles and client_profiles rules: their own members and members of their gym);
// anyone else is left out, and the screen says "A member". Never throws: the lists still work without names.
// Not a 'use server' module: called by the Library page on the server, never from the browser.
const CHUNK = 100;

export async function readMemberNames(supabase: SupabaseClient, ids: string[]): Promise<Record<string, string>> {
  const unique = Array.from(new Set(ids.filter(Boolean)));
  const names: Record<string, string> = {};
  for (let i = 0; i < unique.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('profiles')
      .select('id, email, client_profiles(name)')
      .in('id', unique.slice(i, i + CHUNK));
    if (error || !data) continue;
    for (const row of data as { id: string; email: string | null; client_profiles: { name: string | null } | { name: string | null }[] | null }[]) {
      const profile = Array.isArray(row.client_profiles) ? row.client_profiles[0] : row.client_profiles;
      const name = profile?.name?.trim() || row.email || null;
      if (name) names[row.id] = name;
    }
  }
  return names;
}
