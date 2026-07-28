'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createPackage, deletePackage } from '@/lib/data/memberships';
import type { MembershipPackageRow } from '@/lib/data/types';

export function PackageManager({ initialPackages }: { initialPackages: MembershipPackageRow[] }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [creditsPerWeek, setCreditsPerWeek] = useState(4);
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPackage({ name, credits_per_week: creditsPerWeek, description: description || null });
      setName('');
      setDescription('');
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    await deletePackage(id);
    router.refresh();
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-lg border border-black/10 p-4 dark:border-white/10">
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
          className="col-span-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
        >
          {saving ? 'Adding…' : 'Add package'}
        </button>
      </form>

      <ul className="divide-y divide-black/10 rounded-lg border border-black/10 dark:divide-white/10 dark:border-white/10">
        {initialPackages.map((p) => (
          <li key={p.id} className="flex items-center justify-between p-3 text-sm">
            <span>
              {p.name} — {p.credits_per_week}/week
              {p.description ? ` · ${p.description}` : ''}
            </span>
            <button onClick={() => handleDelete(p.id)} className="text-xs text-red-600 hover:underline dark:text-red-400">
              Delete
            </button>
          </li>
        ))}
        {initialPackages.length === 0 && <li className="p-3 text-sm text-zinc-500">No packages yet.</li>}
      </ul>
    </div>
  );
}
