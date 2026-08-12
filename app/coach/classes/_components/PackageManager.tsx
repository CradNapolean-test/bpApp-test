'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createPackage, deletePackage } from '@/lib/data/memberships';
import type { MembershipPackageRow } from '@/lib/data/types';

export function PackageManager({ initialPackages }: { initialPackages: MembershipPackageRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [name, setName] = useState('');
  const [creditsPerWeek, setCreditsPerWeek] = useState(4);
  const [description, setDescription] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () => createPackage({ name, credits_per_week: creditsPerWeek, description: description || null }),
      {
        success: 'Package added',
        onDone: () => {
          setName('');
          setDescription('');
        },
      }
    );
  }

  async function handleDelete(id: string, packageName: string) {
    const ok = await confirm({
      title: `Delete “${packageName}”?`,
      body: 'Clients currently on this package keep their credits, but lose their weekly top-up.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deletePackage(id), { success: 'Package deleted' });
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Package name</label>
          <input required className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Credits per week</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={creditsPerWeek}
            onChange={(e) => setCreditsPerWeek(Number(e.target.value))}
          />
        </div>
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-zinc-500">Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="col-span-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add package'}
        </button>
      </form>

      {initialPackages.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No membership packages yet"
          hint="Packages set how many class credits a client is topped up with each week."
        />
      ) : (
      <div className="space-y-2">
        {initialPackages.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-zinc-50">{p.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {p.credits_per_week} credits/week{p.description ? ` · ${p.description}` : ''}
              </p>
            </div>
            <Button variant="danger" size="sm" onClick={() => handleDelete(p.id, p.name)}>
              Delete
            </Button>
          </div>
        ))}
      </div>
      )}
    </div>
  );
}
