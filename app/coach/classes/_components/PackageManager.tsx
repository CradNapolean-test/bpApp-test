'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createPackage, deletePackage, updatePackage } from '@/lib/data/memberships';
import type { MembershipPackageRow } from '@/lib/data/types';

// Tap-to-edit sheet for an existing package -- Name/Credits per week/Description, Save/Delete/Cancel.
function EditPackageSheet({
  pkg,
  onClose,
  onDelete,
}: {
  pkg: MembershipPackageRow;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { run, busy: saving } = useAction();
  const [name, setName] = useState(pkg.name);
  const [creditsPerWeek, setCreditsPerWeek] = useState(pkg.credits_per_week);
  const [description, setDescription] = useState(pkg.description ?? '');

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () => updatePackage(pkg.id, { name, credits_per_week: creditsPerWeek, description: description || null }),
      { success: 'Package updated', onDone: onClose }
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/45" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Edit package"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[75vh] w-full overflow-y-auto rounded-t-2xl bg-[var(--background)] p-4 pb-6"
      >
        <h2 className="mb-3 text-sm font-bold text-black dark:text-zinc-50">Edit package</h2>
        <form onSubmit={handleSave} className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Name</label>
            <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Description</label>
            <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="flex gap-2 pt-1">
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button type="button" variant="danger" onClick={() => onDelete(pkg.id, pkg.name)}>
              Delete
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function PackageManager({ initialPackages }: { initialPackages: MembershipPackageRow[] }) {
  const confirm = useConfirm();
  const { run: runCreate, busy: saving } = useAction();
  const { run: runDelete } = useAction();
  const [addingPackage, setAddingPackage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
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
          setAddingPackage(false);
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
    await runDelete(() => deletePackage(id), { success: 'Package deleted', onDone: () => setEditingId(null) });
  }

  const inputCls = 'w-full rounded-md border border-black/10 bg-transparent px-3 py-2 text-sm dark:border-white/10';

  return (
    <div className="space-y-6">
      {addingPackage ? (
        <form onSubmit={handleCreate} className="grid grid-cols-2 gap-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500">Package name</label>
            <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
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
          <div className="col-span-2 flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50"
            >
              {saving ? 'Adding…' : 'Add package'}
            </button>
            <Button type="button" variant="ghost" onClick={() => setAddingPackage(false)}>
              Cancel
            </Button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setAddingPackage(true)}
          className="w-full rounded-2xl border-[1.5px] border-dashed border-black/15 py-3 text-sm font-semibold text-zinc-500 dark:border-white/15"
        >
          + Add package
        </button>
      )}

      {initialPackages.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No membership packages yet"
          hint="Packages set how many class credits a client is topped up with each week."
        />
      ) : (
      <div className="space-y-2">
        {initialPackages.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => setEditingId(p.id)}
            className="flex w-full items-center justify-between gap-2.5 rounded-2xl border border-black/[.05] p-3.5 text-left shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold text-black dark:text-zinc-50">{p.name}</p>
              <p className="mt-0.5 text-xs text-zinc-500">
                {p.credits_per_week} credits/week{p.description ? ` · ${p.description}` : ''}
              </p>
            </div>
          </button>
        ))}
      </div>
      )}

      {editingId && (
        <EditPackageSheet
          pkg={initialPackages.find((p) => p.id === editingId)!}
          onClose={() => setEditingId(null)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
