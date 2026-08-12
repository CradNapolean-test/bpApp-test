import { createClient } from '@/lib/supabase/server';
import { MessagesDrawerProvider } from './_components/MessagesDrawerContext';

// Mounts the shared MessagesDrawer overlay once for every /coach/** page (Next's nested-layout
// composition), so CoachMessagesButton can open it from anywhere without each page threading a
// currentUserId prop through. Doesn't duplicate each page's own auth/role-redirect logic --
// every page under here already gates on being a signed-in coach itself; if user is somehow
// null here the provider just never gets a valid id to open with, a harmless inert state.
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <MessagesDrawerProvider currentUserId={user?.id ?? ''}>{children}</MessagesDrawerProvider>;
}
