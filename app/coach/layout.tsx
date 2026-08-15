import { createClient } from '@/lib/supabase/server';
import { MessagesDrawerProvider } from './_components/MessagesDrawerContext';
import { CoachBrandingProvider } from './_components/CoachBrandingContext';

// Mounts the shared MessagesDrawer overlay once for every /coach/** page (Next's nested-layout
// composition), so CoachMessagesButton can open it from anywhere without each page threading a
// currentUserId prop through. Doesn't duplicate each page's own auth/role-redirect logic --
// every page under here already gates on being a signed-in coach itself; if user is somehow
// null here the provider just never gets a valid id to open with, a harmless inert state.
//
// Also resolves the coach's logo (if any, 0047) to a public URL once here, same reasoning --
// every page's <CoachBrand /> reads it via context instead of each page's own server
// component fetching+passing it down individually.
export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let logoUrl: string | null = null;
  if (user) {
    const { data: profile } = await supabase.from('profiles').select('logo_path').eq('id', user.id).maybeSingle();
    if (profile?.logo_path) {
      logoUrl = supabase.storage.from('coach-branding').getPublicUrl(profile.logo_path).data.publicUrl;
    }
  }

  return (
    <CoachBrandingProvider logoUrl={logoUrl}>
      <MessagesDrawerProvider currentUserId={user?.id ?? ''}>{children}</MessagesDrawerProvider>
    </CoachBrandingProvider>
  );
}
