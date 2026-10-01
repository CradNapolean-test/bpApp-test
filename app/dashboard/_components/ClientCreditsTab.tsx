'use client';

import { useState } from 'react';
import type { ClientMembershipRow, CreditBucketBalances, CreditsLedgerRow } from '@/lib/data/types';

const PAGE = 10;

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

// "membership reset: week of 2026-09-28" reads as system noise -- say what it means.
function friendlyReason(reason: string): string {
  const m = reason.match(/^membership reset: week of (\d{4}-\d{2}-\d{2})/);
  if (!m) return reason;
  const d = new Date(m[1] + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return `Weekly allowance reset · week of ${d}`;
}

// Client-facing "view my balance & history" screen -- distinct from CreditsTab.tsx, which is
// a coach-admin panel (grant credits, assign a package, set reminder thresholds) never meant
// for a client to see directly.
export function ClientCreditsTab({
  creditsBalance,
  creditsBuckets,
  membership,
  ledger,
}: {
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
  ledger: CreditsLedgerRow[];
}) {
  const [shown, setShown] = useState(PAGE);
  return (
    <div>
      <div className="rounded-2xl bg-accent p-4 text-accent-foreground">
        <p className="text-xs opacity-85">Current balance</p>
        <p className="mt-0.5 text-3xl font-extrabold">
          {creditsBalance} credit{creditsBalance === 1 ? '' : 's'}
        </p>
        <p className="mt-1 text-xs opacity-80">
          {creditsBuckets.membership} from your weekly allowance · {creditsBuckets.bonus} bonus
        </p>
        {membership?.package && (
          <p className="mt-1.5 text-xs opacity-90">
            {membership.package.name} &middot; {membership.package.credits_per_week} / week
          </p>
        )}
      </div>

      <p className="mb-2 mt-5 text-xs font-semibold uppercase tracking-wide text-zinc-500">Credit history</p>
      {ledger.length === 0 ? (
        <p className="text-sm text-zinc-500">No credit activity yet.</p>
      ) : (
        <div className="space-y-2">
          {ledger.slice(0, shown).map((entry) => (
            <div
              key={entry.id}
              className="flex items-center justify-between rounded-2xl border border-black/[.05] bg-card p-3.5 dark:border-white/10"
            >
              <div>
                <p className="text-sm font-semibold text-black dark:text-zinc-50">{friendlyReason(entry.reason)}</p>
                <p className="mt-0.5 text-xs text-zinc-400">
                  {shortDate(entry.created_at)}
                  {entry.expires_at && !entry.expired_at
                    ? ` · expires ${shortDate(entry.expires_at)}`
                    : ''}
                </p>
              </div>
              <p className={`text-sm font-bold ${entry.delta >= 0 ? 'text-success' : 'text-danger'}`}>
                {entry.delta > 0 ? '+' : ''}
                {entry.delta === 0 ? '±0' : entry.delta}
              </p>
            </div>
          ))}
          {ledger.length > shown && (
            <button
              type="button"
              onClick={() => setShown(shown + PAGE)}
              className="w-full rounded-full border border-black/10 py-2.5 text-sm font-semibold text-zinc-600 dark:border-white/10 dark:text-zinc-300"
            >
              Show earlier ({ledger.length - shown} more)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
