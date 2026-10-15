'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { browserLocalStorage, clearMemberLocalData } from '@/lib/utils/localData';
import { disablePushNotifications } from './pushNotifications';
import { withTimeout } from '@/lib/pushRegistration';
import { Button } from './Button';

export function SignOutButton({
  variant = 'outline',
  className,
}: {
  variant?: 'outline' | 'danger-solid' | 'danger-soft';
  className?: string;
}) {
  const router = useRouter();

  async function handleSignOut() {
    // Don't leave a copy of the member's plan, or half-written form answers, on a shared phone (see OfflineSnapshot, FormsTab).
    clearMemberLocalData(browserLocalStorage());
    // This browser's push subscription belongs to the person signing out: remove it (and its row) while the session is still valid, so the
    // next person on a shared phone does not get this person's notifications (R18). Quick or nothing: never leave someone stuck here.
    await withTimeout(disablePushNotifications(), 2000).catch(() => {});
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant={variant} size="sm" className={className} onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
