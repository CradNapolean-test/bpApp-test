import { cache } from 'react';
import { createClient } from './server';

// The signed-in person, checked once per page request (R13/M1). The root layout and the page each used to ask Supabase "who is this?" over
// the network (and the middleware a third time); React's cache() makes every caller within one request share the first answer.
// getUser() rather than the cookie alone: this one is trusted to say who is signed in, and is checked with the server.
export const getCurrentUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

// The signed-in coach's own row as the coach dashboard needs it, read once per page request: the page's "is this a coach?" check and
// getCoachDashboard used to read it one after the other before any member was read (item 9).
export const getMyCoachProfile = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('role, gym_id, is_gym_admin, display_name, gym:gym_id(timezone)').eq('id', user.id).maybeSingle();
  return data as {
    role: string | null;
    gym_id: string | null;
    is_gym_admin: boolean | null;
    display_name: string | null;
    gym: { timezone: string | null } | { timezone: string | null }[] | null;
  } | null;
});

// The signed-in person's own row in profiles, read once per page request for the same reason (the layout reads the theme from it, the
// member page the role and email).
export const getMyProfileRow = cache(async () => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from('profiles').select('role, email, theme_preference').eq('id', user.id).maybeSingle();
  return data as { role: string | null; email: string; theme_preference: string | null } | null;
});
