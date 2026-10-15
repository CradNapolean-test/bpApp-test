'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { browserLocalStorage, clearMemberLocalData } from '@/lib/utils/localData';
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
