'use client';

import { useEffect, useState } from 'react';
import { getMyCreditHistory } from '@/lib/data/memberships';
import { friendlyCreditReason } from '@/lib/creditsForm';
import { todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientMembershipRow, CreditBucketBalances, CreditsLedgerRow } from '@/lib/data/types';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

// Client-facing "my credits & membership" screen -- distinct from CreditsTab.tsx, which is a
// coach-admin panel (grant credits, assign a package, set reminder thresholds). A member sees their
// balance, what is about to run out, the last few changes and their plan; the full ledger lives with
// the coach.
export function ClientCreditsTab({
  clientId,
  creditsBalance,
  creditsBuckets,
  membership,
}: {
  clientId: string;
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
}) {
  const pkg = membership?.package ?? null;
  // The last ten changes and the bonus credits that will run out (CC1). Read when the screen opens, and again when the balance changes.
  const [history, setHistory] = useState<{ recent: CreditsLedgerRow[]; expiring: CreditsLedgerRow[] } | null>(null);
  useEffect(() => {
    let live = true;
    getMyCreditHistory(clientId, 10)
      .then((h) => {
        if (live) setHistory(h);
      })
      .catch(() => {
        if (live) setHistory({ recent: [], expiring: [] });
      });
    return () => {
      live = false;
    };
  }, [clientId, creditsBalance]);

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
        <p className="mt-1 text-xs opacity-80">Your weekly allowance resets every Monday.</p>
      </div>

      {history && history.expiring.length > 0 && (
        <div className="rounded-2xl border border-warning/30 bg-warning/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-warning">Bonus credits that run out</p>
          <ul className="mt-2 space-y-1.5 text-sm">
            {history.expiring.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate text-black dark:text-zinc-50">
                  {friendlyCreditReason(c.reason)} <span className="text-zinc-500">(+{c.delta})</span>
                </span>
                <span className="shrink-0 font-semibold text-black dark:text-zinc-50">until {shortDate(c.expires_at as string)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-zinc-400">Recent activity</p>
        {!history ? (
          <p className="mt-2 text-sm text-zinc-500">Loading…</p>
        ) : history.recent.length === 0 ? (
          <p className="mt-2 text-sm text-zinc-500">No credit activity yet.</p>
        ) : (
          <ul className="mt-1 divide-y divide-black/[.05] dark:divide-white/10">
            {history.recent.map((c) => (
              <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm text-black dark:text-zinc-50">{friendlyCreditReason(c.reason)}</span>
                  <span className="block text-xs text-zinc-500">{shortDate(c.created_at)}</span>
                </span>
                <span className={`shrink-0 text-sm font-bold ${c.delta > 0 ? 'text-success' : c.delta < 0 ? 'text-danger' : 'text-zinc-400'}`}>
                  {c.delta > 0 ? '+' : ''}
                  {c.delta === 0 ? '±0' : c.delta}
                </span>
              </li>
            ))}
          </ul>
        )}
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
              {membership?.started_at && membership.started_at > todayIsoInTz(DEFAULT_TIMEZONE) && (
                <div className="flex justify-between py-2">
                  <dt className="text-zinc-500">Starts</dt>
                  <dd className="font-semibold text-black dark:text-zinc-50">{longDate(membership.started_at)}</dd>
                </div>
              )}
              {membership?.scheduled_end && (
                <div className="flex justify-between py-2">
                  <dt className="text-zinc-500">Ends</dt>
                  <dd className="font-semibold text-black dark:text-zinc-50">{longDate(membership.scheduled_end)}</dd>
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
