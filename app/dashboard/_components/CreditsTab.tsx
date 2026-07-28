'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { grantCredits } from '@/lib/data/classes';
import { assignMembership } from '@/lib/data/memberships';
import type { ClientMembershipRow, MembershipPackageRow } from '@/lib/data/types';

export function CreditsTab({
  clientId,
  creditsBalance,
  membership,
  packages,
}: {
  clientId: string;
  creditsBalance: number;
  membership: ClientMembershipRow | null;
  packages: MembershipPackageRow[];
}) {
  const router = useRouter();
  const [grantAmount, setGrantAmount] = useState(1);
  const [grantReason, setGrantReason] = useState('manual grant');
  const [granting, setGranting] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState(membership?.package_id ?? '');
  const [assigning, setAssigning] = useState(false);

  async function handleGrant(e: React.FormEvent) {
    e.preventDefault();
    setGranting(true);
    try {
      await grantCredits(clientId, grantAmount, grantReason);
      router.refresh();
    } finally {
      setGranting(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedPackage) return;
    setAssigning(true);
    try {
      await assignMembership(clientId, selectedPackage);
      router.refresh();
    } finally {
      setAssigning(false);
    }
  }

  const inputCls = 'rounded-md border border-black/10 bg-transparent px-2 py-1.5 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-black/10 p-4 dark:border-white/10">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Credits</h3>
        <p className="mt-1 text-2xl font-semibold text-black dark:text-zinc-50">{creditsBalance}</p>

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
          <button
            type="submit"
            disabled={granting}
            className="rounded-md bg-foreground px-3 py-1.5 text-sm font-medium text-background disabled:opacity-50"
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
    </div>
  );
}
