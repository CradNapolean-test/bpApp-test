import { createClient } from '@/lib/supabase/server';
import { MessagesDrawerProvider } from './_components/MessagesDrawerContext';
import { CoachBrandingProvider } from './_components/CoachBrandingContext';
import { CoachGymsProvider } from './_components/CoachGymsContext';
import { GymMismatchBanner } from './_components/GymMismatchBanner';
import { getClientGymMismatch, getMyGyms } from '@/lib/data/gym';
import type { GymMismatch } from '@/lib/gymMismatch';

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
  let gyms: Awaited<ReturnType<typeof getMyGyms>> = [];
  let mismatch: GymMismatch | null = null;
  if (user) {
    // The sites this coach belongs to, for the header switcher. Never worth failing the page over.
    gyms = await getMyGyms().catch(() => []);
    // Whether the coach's members are in a gym other than the one being viewed (R38); only a coach in several gyms can have this.
    if (gyms.length > 1) mismatch = await getClientGymMismatch(gyms).catch(() => null);
    const { data: profile } = await supabase.from('profiles').select('logo_path').eq('id', user.id).maybeSingle();
    if (profile?.logo_path) {
      logoUrl = supabase.storage.from('coach-branding').getPublicUrl(profile.logo_path).data.publicUrl;
    }
  }

  return (
    <CoachBrandingProvider logoUrl={logoUrl}>
      <CoachGymsProvider gyms={gyms} mismatch={mismatch}>
        <MessagesDrawerProvider currentUserId={user?.id ?? ''}>
          <GymMismatchBanner />
          {children}
        </MessagesDrawerProvider>
      </CoachGymsProvider>
    </CoachBrandingProvider>
  );
}
