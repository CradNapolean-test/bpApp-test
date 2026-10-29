import { useQuery } from '@tanstack/react-query';

import { FAQS } from '@ballistic/shared/utils/community';

import { FaqList } from '@/components/community';
import { ScrollScreen } from '@/components/ui';
import { useSession } from '@/lib/session';
import { supabase } from '@/lib/supabase';

// Frequently asked questions. (The Terms and Privacy links come once the app has a web address to point them at.)
export default function Faq() {
  const { session } = useSession();
  // The member's coach's address (the narrow get_my_coach_email read, migration 0048). The question appears once it is known.
  const coachEmail = useQuery({
    queryKey: ['coach-email', session?.user.id],
    enabled: !!session,
    staleTime: 10 * 60_000,
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase.rpc('get_my_coach_email');
      if (error) throw error;
      return typeof data === 'string' && data ? data : null;
    },
  });
  const items = coachEmail.data ? [...FAQS, { q: 'Email your coach', a: 'Prefer email? Write to your coach at:', email: coachEmail.data }] : FAQS;
  return (
    <ScrollScreen>
      <FaqList items={items} />
    </ScrollScreen>
  );
}
