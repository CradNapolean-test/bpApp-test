'use client';

import { useEffect, useState } from 'react';
import { CalendarCheck, Minus, Plus } from 'lucide-react';
import CountUp from '@/app/_components/motion/CountUp';
import { getMyCreditHistory } from '@/lib/data/memberships';
import { friendlyCreditReason } from '@/lib/creditsForm';
import { planCountdown } from '@/lib/planCountdown';
import { todayIsoInTz, DEFAULT_TIMEZONE } from '@/lib/utils/dates';
import type { ClientMembershipRow, CreditBucketBalances, CreditsLedgerRow } from '@/lib/data/types';

const longDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
const cardCls = 'rounded-[20px] border border-black/[.08] bg-card dark:border-white/10';
const headCls = 'text-base font-extrabold text-black dark:text-zinc-50';

// Client-facing "my credits & membership" screen -- distinct from CreditsTab.tsx, which is a
// coach-admin panel (grant credits, assign a package, set reminder thresholds). A member sees their
// balance, what is about to run out, the last few changes and their plan; the full ledger lives with
// the coach.
export function ClientCreditsTab({
  clientId,
  creditsBalance,
  creditsBuckets,
  membership,
  onBook,
}: {
  clientId: string;
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
  // The member's screen: the balance card's "Book a class" opens the Book tab. Left out for a coach looking at the screen.
  onBook?: () => void;
}) {
  const pkg = membership?.package ?? null;
  // A plan with a set length (the 6 Week Challenge): how long it is and which week the member is in (D5).
  const countdown =
    membership && pkg?.duration_weeks ? planCountdown({ ...membership, durationWeeks: pkg.duration_weeks }, todayIsoInTz(DEFAULT_TIMEZONE)) : null;
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
    <div className="space-y-5">
      <section aria-label="Your balance" className="space-y-3 rounded-[20px] bg-accent p-4 text-accent-foreground">
        <div className="space-y-1">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em]">Your balance</p>
          <p className="text-[26px] font-black leading-tight">
            <CountUp to={creditsBalance} delay={0.15} /> credit{creditsBalance === 1 ? '' : 's'}
          </p>
          <p className="text-sm font-medium leading-snug">
            {creditsBuckets.membership} from your weekly allowance · {creditsBuckets.bonus} bonus. Your allowance resets every Saturday.
          </p>
        </div>
        {onBook && (
          <button type="button" onClick={onBook} className="h-11 w-full rounded-xl bg-[#1d1d1b] text-sm font-bold text-white">
            Book a class
          </button>
        )}
      </section>

      {history && history.expiring.length > 0 && (
        <div className="rounded-[20px] border border-warning/30 bg-warning/10 p-4">
          <p className="text-sm font-extrabold text-warning">Bonus credits that run out</p>
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

      <section className="space-y-2.5">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className={headCls}>History</h2>
          {history && history.recent.length > 0 && <span className="text-[13px] font-semibold text-zinc-500 dark:text-zinc-400">Newest first</span>}
        </div>
        {!history ? (
          <p className={`${cardCls} p-4 text-sm text-zinc-500`}>Loading…</p>
        ) : history.recent.length === 0 ? (
          <p className={`${cardCls} p-4 text-sm text-zinc-500`}>No credit activity yet.</p>
        ) : (
          <ul className={`${cardCls} divide-y divide-black/[.07] overflow-hidden dark:divide-white/10`}>
            {history.recent.map((c) => {
              const reason = friendlyCreditReason(c.reason);
              const Icon = /book|class|attend|session/i.test(reason) ? CalendarCheck : c.delta >= 0 ? Plus : Minus;
              return (
                <li key={c.id} className="flex min-h-[60px] items-center gap-3 px-3.5 py-2.5">
                  <span aria-hidden className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-soft text-accent">
                    <Icon className="h-[18px] w-[18px]" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-black dark:text-zinc-50">{reason}</span>
                    <span className="block text-[13px] text-zinc-500 dark:text-zinc-400">{shortDate(c.created_at)}</span>
                  </span>
                  <span className={`shrink-0 text-base font-extrabold ${c.delta > 0 ? 'text-accent' : 'text-black dark:text-zinc-50'}`}>
                    {c.delta > 0 ? '+' : c.delta < 0 ? '−' : ''}
                    {c.delta === 0 ? '±0' : Math.abs(c.delta)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="space-y-2.5">
      <h2 className={headCls}>Your membership</h2>
      <div className={`${cardCls} p-4`}>
        {pkg ? (
          <>
            <p className="text-lg font-extrabold text-black dark:text-zinc-50">{pkg.name}</p>
            {pkg.description && <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{pkg.description}</p>}
            <dl className="mt-3 divide-y divide-black/[.07] text-sm dark:divide-white/10">
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
              {countdown && countdown.totalWeeks && (
                <div className="flex justify-between py-2">
                  <dt className="text-zinc-500">Length</dt>
                  <dd className="font-semibold text-black dark:text-zinc-50">
                    {countdown.totalWeeks} weeks{countdown.state === 'active' && countdown.week ? ` · you are in week ${countdown.week}` : ''}
                  </dd>
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
          <p className="text-sm text-zinc-500">No membership plan is set up on your account yet. Ask your coach.</p>
        )}
      </div>
      </section>
    </div>
  );
}
