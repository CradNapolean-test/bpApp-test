'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { grantCredits } from '@/lib/data/classes';
import { assignMembership, grantCreditPack } from '@/lib/data/memberships';
import { updateCheckinReminderDays } from '@/lib/data/clientProfile';
import type { ClientMembershipRow, CreditBucketBalances, CreditPackRow, MembershipPackageRow } from '@/lib/data/types';

export function CreditsTab({
  clientId,
  creditsBalance,
  creditsBuckets,
  membership,
  packages,
  creditPacks,
  checkinReminderDays,
  lastCheckinReminderAt,
}: {
  clientId: string;
  creditsBalance: number;
  creditsBuckets: CreditBucketBalances;
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
  creditPacks: CreditPackRow[];
  checkinReminderDays: number;
  lastCheckinReminderAt: string | null;
}) {
  const { run: runGrant, busy: granting } = useAction();
  const { run: runAssign, busy: assigning } = useAction();
  const { run: runGrantPack, busy: grantingPack } = useAction();
  const { run: runReminder, busy: savingReminder } = useAction();
  const [grantAmount, setGrantAmount] = useState(1);
  const [grantReason, setGrantReason] = useState('manual grant');
  const [grantExpiresAt, setGrantExpiresAt] = useState('');
  const [selectedPackage, setSelectedPackage] = useState(membership?.package_id ?? '');
  const [selectedPack, setSelectedPack] = useState('');
  const [reminderDays, setReminderDays] = useState(checkinReminderDays);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    const expiresAt = grantExpiresAt ? new Date(`${grantExpiresAt}T23:59:59`).toISOString() : null;
    await runGrant(() => grantCredits(clientId, grantAmount, grantReason, expiresAt), {
      success: `${grantAmount > 0 ? '+' : ''}${grantAmount} credits applied`,
    });
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPackage) return;
    await runAssign(() => assignMembership(clientId, selectedPackage), { success: 'Package assigned' });
  }

  async function handleGrantPack(e: React.FormEvent) {
    e.preventDefault();
    const pack = creditPacks.find((p) => p.id === selectedPack);
    if (!pack) return;
    await runGrantPack(() => grantCreditPack(clientId, pack), { success: `${pack.name} granted` });
  }

  async function handleSaveReminder(e: React.FormEvent) {
    e.preventDefault();
    await runReminder(() => updateCheckinReminderDays(clientId, reminderDays), {
      success: reminderDays === 0 ? 'Check-in reminders turned off' : `Reminders set to ${reminderDays} days`,
    });
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Credits</h3>
        <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{creditsBalance}</p>
        <p className="mt-0.5 text-xs text-zinc-500">
          {creditsBuckets.membership} membership (resets weekly) · {creditsBuckets.bonus} bonus (manual grants +
          packs, carries over)
        </p>

        <form onSubmit={handleGrant} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Amount</label>
            <input
              type="number"
              value={grantAmount}
              onChange={(e) => setGrantAmount(Number(e.target.value))}
              className={`${inputCls} w-20`}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Reason</label>
            <input
              type="text"
              value={grantReason}
              onChange={(e) => setGrantReason(e.target.value)}
              className={inputCls}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Expires (optional)</label>
            <input
              type="date"
              value={grantExpiresAt}
              onChange={(e) => setGrantExpiresAt(e.target.value)}
              className={inputCls}
            />
          </div>
          <button
            type="submit"
            disabled={granting}
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-accent-foreground disabled:opacity-50"
          >
            {granting ? 'Granting…' : 'Grant credits'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Membership package</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          {membership?.package
            ? `Current: ${membership.package.name} (${membership.package.credits_per_week}/week)`
            : 'No package assigned yet.'}
        </p>
        <form onSubmit={handleAssign} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Assign package</label>
            <select
              className={inputCls}
              value={selectedPackage}
              onChange={(e) => setSelectedPackage(e.target.value)}
            >
              <option value="">Select…</option>
              {packages.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.credits_per_week}/week)
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={assigning || !selectedPackage}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10"
          >
            {assigning ? 'Assigning…' : 'Assign'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Grant a credit pack</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          One-off bonus credits from the catalog (Classes → Credit Packs) -- doesn&apos;t recur, and expires on
          its own schedule if the pack has one set.
        </p>
        <form onSubmit={handleGrantPack} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Pack</label>
            <select className={inputCls} value={selectedPack} onChange={(e) => setSelectedPack(e.target.value)}>
              <option value="">Select…</option>
              {creditPacks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.credits} credits{p.expires_after_days ? `, ${p.expires_after_days}d` : ''})
                </option>
              ))}
            </select>
          </div>
          <button
            type="submit"
            disabled={grantingPack || !selectedPack}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10"
          >
            {grantingPack ? 'Granting…' : 'Grant pack'}
          </button>
        </form>
      </div>

      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Check-in reminders</h3>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Nudge this client if they haven&apos;t logged a real Weekly Log entry in a while. Set to 0 to
          turn off.
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Last reminded: {lastCheckinReminderAt ? new Date(lastCheckinReminderAt).toLocaleString() : 'Never'}
        </p>
        <form onSubmit={handleSaveReminder} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Days of inactivity</label>
            <input
              type="number"
              min={0}
              value={reminderDays}
              onChange={(e) => setReminderDays(Number(e.target.value))}
              className={`${inputCls} w-20`}
            />
          </div>
          <button
            type="submit"
            disabled={savingReminder}
            className="rounded-md border border-black/10 px-3 py-1.5 text-sm font-medium disabled:opacity-50 dark:border-white/10"
          >
            {savingReminder ? 'Saving…' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
