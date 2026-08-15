import type { ClientMembershipRow, CreditsLedgerRow } from '@/lib/data/types';

// Client-facing "view my balance & history" screen -- distinct from CreditsTab.tsx, which is
// a coach-admin panel (grant credits, assign a package, set reminder thresholds) never meant
// for a client to see directly.
export function ClientCreditsTab({
  creditsBalance,
  membership,
  ledger,
}: {
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  ledger: CreditsLedgerRow[];
}) {
  return (
    <div>
      <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
        <p className="text-xs opacity-85">Current balance</p>
        <p className="mt-0.5 text-3xl font-extrabold">
          {creditsBalance} credit{creditsBalance === 1 ? '' : 's'}
        </p>
        {membership?.package && (
          <p className="mt-1.5 text-xs opacity-90">
            {membership.package.name} &middot; {membership.package.credits_per_week} / week
          </p>
        )}
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold text-zinc-500">LEDGER</p>
      {ledger.length === 0 ? (
        <p className="text-sm text-zinc-500">No credit activity yet.</p>
      ) : (
        <div className="space-y-2">
          {ledger.map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-2xl border border-black/[.05] p-3.5 dark:border-white/10"
            >
              <div>
                <p className="text-sm font-semibold text-black dark:text-zinc-50">{entry.reason}</p>
                <p className="mt-0.5 text-xs text-zinc-400">{new Date(entry.created_at).toLocaleDateString()}</p>
              </div>
              <p className={`text-sm font-bold ${entry.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                {entry.delta > 0 ? '+' : ''}
                {entry.delta}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
