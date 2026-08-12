'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from './Button';

export function SignOutButton({ variant = 'outline' }: { variant?: 'outline' | 'danger-solid' }) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <Button variant={variant} size="sm" onClick={handleSignOut}>
      Sign out
    </Button>
  );
}
