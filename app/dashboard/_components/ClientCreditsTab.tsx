import type { ClientMembershipRow, CreditBucketBalances } from '@/lib/data/types';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

// Client-facing "my credits & membership" screen -- distinct from CreditsTab.tsx, which is a
// coach-admin panel (grant credits, assign a package, set reminder thresholds). The full credit
// ledger lives with the coach; members just see their balance and plan.
export function ClientCreditsTab({
  creditsBalance,
  creditsBuckets,
  membership,
}: {
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
}) {
  const pkg = membership?.package ?? null;
  return (
    <div className="space-y-4">
      <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
        <p className="text-xs opacity-85">Credits available</p>
        <p className="mt-0.5 text-3xl font-extrabold">
          {creditsBalance} credit{creditsBalance === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-xs opacity-80">
          {creditsBuckets.membership} from your weekly allowance · {creditsBuckets.bonus} bonus
        </p>
      </div>

      <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Your membership</p>
        {pkg ? (
          <>
            <p className="mt-1 text-lg font-extrabold text-black dark:text-zinc-50">{pkg.name}</p>
            {pkg.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{pkg.description}</p>}
            <dl className="mt-3 divide-y divide-black/[.05] text-sm dark:divide-white/10">
              <div className="flex justify-between py-2">
                <dt className="text-zinc-500">Weekly allowance</dt>
                <dd className="font-semibold text-black dark:text-zinc-50">
                  {pkg.credits_per_week} credit{pkg.credits_per_week === 1 ? '' : 's'} a week
                </dd>
              </div>
              {pkg.advance_booking_days != null && (
                <div className="flex justify-between py-2">
                  <dt className="text-zinc-500">Book up to</dt>
                  <dd className="font-semibold text-black dark:text-zinc-50">{pkg.advance_booking_days} days ahead</dd>
                </div>
              )}
              {membership?.started_at && (
                <div className="flex justify-between py-2">
                  <dt className="text-zinc-500">Member since</dt>
                  <dd className="font-semibold text-black dark:text-zinc-50">{longDate(membership.started_at)}</dd>
                </div>
              )}
            </dl>
          </>
        ) : (
          <p className="mt-1 text-sm text-zinc-500">No membership plan is set up on your account yet. Ask your coach.</p>
        )}
      </div>
    </div>
  );
}
