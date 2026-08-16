'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createCreditPack, deleteCreditPack, updateCreditPack } from '@/lib/data/memberships';
import type { CreditPackRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

// Catalog CRUD for one-off, optionally-expiring credit bundles -- the credit-pack counterpart
// to PackageManager.tsx's recurring membership packages. Granting a pack to a specific client
// happens from CreditsTab, not here; this only manages what's available to grant.
function EditPackCard({
  pack,
  onClose,
  onDelete,
}: {
  pack: CreditPackRow;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { run, busy: saving } = useAction();
  const [name, setName] = useState(pack.name);
  const [credits, setCredits] = useState(pack.credits);
  const [expiresAfterDays, setExpiresAfterDays] = useState(pack.expires_after_days ?? 0);
  const [description, setDescription] = useState(pack.description ?? '');

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updateCreditPack(pack.id, {
          name,
          credits,
          expires_after_days: expiresAfterDays > 0 ? expiresAfterDays : null,
          description: description || null,
        }),
      { success: 'Pack updated', onDone: onClose }
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <form onSubmit={handleSave} className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Name</label>
          <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Credits</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={credits}
            onChange={(e) => setCredits(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Expires after (days, 0 = never)</label>
          <input
            type="number"
            min={0}
            className={inputCls}
            value={expiresAfterDays}
            onChange={(e) => setExpiresAfterDays(Number(e.target.value))}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Description</label>
          <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => onDelete(pack.id, pack.name)}>
            Delete
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

function AddPackCard({ onDone }: { onDone: () => void }) {
  const { run: runCreate, busy: saving } = useAction();
  const [name, setName] = useState('');
  const [credits, setCredits] = useState(10);
  const [expiresAfterDays, setExpiresAfterDays] = useState(90);
  const [description, setDescription] = useState('');

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createCreditPack({
          name,
          credits,
          expires_after_days: expiresAfterDays > 0 ? expiresAfterDays : null,
          description: description || null,
        }),
      { success: 'Pack added', onDone }
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Pack name</label>
        <input required autoFocus className={inputCls} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Credits</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={credits}
          onChange={(e) => setCredits(Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Expires after (days, 0 = never)</label>
        <input
          type="number"
          min={0}
          className={inputCls}
          value={expiresAfterDays}
          onChange={(e) => setExpiresAfterDays(Number(e.target.value))}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Description</label>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? 'Adding…' : 'Add pack'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function CreditPackManager({ initialPacks }: { initialPacks: CreditPackRow[] }) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [addingPack, setAddingPack] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string, packName: string) {
    const ok = await confirm({
      title: `Delete “${packName}”?`,
      body: 'Clients who already received this pack keep the credits they were granted -- this only removes it from what you can grant going forward.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deleteCreditPack(id), { success: 'Pack deleted', onDone: () => setEditingId(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingPack(true)}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + Add pack
        </button>
      </div>

      {addingPack && <AddPackCard onDone={() => setAddingPack(false)} />}

      {initialPacks.length === 0 ? (
        <EmptyState
          icon={Sparkles}
          title="No credit packs yet"
          hint="Packs are one-off bundles of credits you can grant to a client -- useful for drop-ins who aren't on a recurring membership."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initialPacks.map((p) =>
            editingId === p.id ? (
              <EditPackCard key={p.id} pack={p} onClose={() => setEditingId(null)} onDelete={handleDelete} />
            ) : (
              <div
                key={p.id}
                className="rounded-2xl border border-black/[.05] p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{p.name}</p>
                  <div className="flex shrink-0 gap-2.5 text-sm font-semibold">
                    <button type="button" onClick={() => setEditingId(p.id)} className="text-black hover:underline dark:text-zinc-50">
                      Edit
                    </button>
                    <button type="button" onClick={() => handleDelete(p.id, p.name)} className="text-danger hover:underline">
                      Delete
                    </button>
                  </div>
                </div>
                <p className="mt-2 text-2xl font-extrabold text-[#19adb1]">
                  {p.credits} <span className="text-sm font-medium text-zinc-500">credits</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {p.expires_after_days ? `Expires ${p.expires_after_days} days after granting` : 'Never expires'}
                  {p.description ? ` · ${p.description}` : ''}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
