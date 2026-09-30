import { redirect } from 'next/navigation';

// Memberships moved into Business (plans, credit packs) -- keep old links working.
export default async function CoachMembershipsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams;
  redirect(`/coach/business?tab=${tab === 'credit-packs' ? 'credit-packs' : 'plans'}`);
}
