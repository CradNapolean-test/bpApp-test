'use client';

import { useState } from 'react';
import { Ticket } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { EmptyState } from '@/app/_components/EmptyState';
import { createPackage, deletePackage, updatePackage } from '@/lib/data/memberships';
import { DISABLEABLE_SCREENS } from '@/app/dashboard/_components/categories';
import type { MembershipPackageRow } from '@/lib/data/types';

const inputCls = 'w-full rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10';

// All-checked collapses to `null` (unrestricted) on save -- the canonical "this tier doesn't
// restrict anything" value, same as every package that predates this feature. Partially
// checked saves the checked subset; a client on this package loses access to whatever's left
// unchecked here, live, layered under their own per-client toggles (see
// categories.ts's toEffectiveDisabledScreenSet).
function ScreenAccessPicker({ selected, onChange }: { selected: Set<string>; onChange: (next: Set<string>) => void }) {
  function toggle(screen: string) {
    const next = new Set(selected);
    if (next.has(screen)) next.delete(screen);
    else next.add(screen);
    onChange(next);
  }

  return (
    <div className="space-y-1">
      <label className="text-xs font-medium text-zinc-500">Screens this tier can access</label>
      <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-black/10 p-3 dark:border-white/10">
        {DISABLEABLE_SCREENS.map((screen) => (
          <label key={screen} className="flex items-center gap-2 text-sm text-black dark:text-zinc-50">
            <input type="checkbox" checked={selected.has(screen)} onChange={() => toggle(screen)} />
            {screen}
          </label>
        ))}
      </div>
    </div>
  );
}

function screensToIncludedScreens(selected: Set<string>): string[] | null {
  return selected.size >= DISABLEABLE_SCREENS.length ? null : Array.from(selected);
}

// Inline edit form -- replaces a card's own content in place, matching the desktop pattern
// used by ClassManager's row edit (plenty of width for this instead of a mobile bottom sheet).
function EditPackageCard({
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
  const [screens, setScreens] = useState<Set<string>>(new Set(pkg.included_screens ?? DISABLEABLE_SCREENS));

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    await run(
      () =>
        updatePackage(pkg.id, {
          name,
          credits_per_week: creditsPerWeek,
          description: description || null,
          included_screens: screensToIncludedScreens(screens),
        }),
      { success: 'Package updated', onDone: onClose }
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
        <ScreenAccessPicker selected={screens} onChange={setScreens} />
        <div className="flex flex-wrap gap-2 pt-1">
          <Button type="submit" variant="primary" size="sm" disabled={saving}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
          <Button type="button" variant="danger" size="sm" onClick={() => onDelete(pkg.id, pkg.name)}>
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

function AddPackageCard({ onDone }: { onDone: () => void }) {
  const { run: runCreate, busy: saving } = useAction();
  const [name, setName] = useState('');
  const [creditsPerWeek, setCreditsPerWeek] = useState(4);
  const [description, setDescription] = useState('');
  const [screens, setScreens] = useState<Set<string>>(new Set(DISABLEABLE_SCREENS));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createPackage({
          name,
          credits_per_week: creditsPerWeek,
          description: description || null,
          included_screens: screensToIncludedScreens(screens),
        }),
      { success: 'Package added', onDone }
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
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
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Description</label>
        <input className={inputCls} value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <ScreenAccessPicker selected={screens} onChange={setScreens} />
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" disabled={saving}>
          {saving ? 'Adding…' : 'Add package'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

export function PackageManager({ initialPackages }: { initialPackages: MembershipPackageRow[] }) {
  const confirm = useConfirm();
  const { run: runDelete } = useAction();
  const [addingPackage, setAddingPackage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string, packageName: string) {
    const ok = await confirm({
      title: `Delete “${packageName}”?`,
      body: 'Clients currently on this package keep their credits, but lose their weekly top-up.',
      destructive: true,
    });
    if (!ok) return;
    await runDelete(() => deletePackage(id), { success: 'Package deleted', onDone: () => setEditingId(null) });
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setAddingPackage(true)}
          className="shrink-0 rounded-full bg-[#141414] px-4 py-2 text-sm font-bold text-white hover:opacity-90"
        >
          + Add package
        </button>
      </div>

      {addingPackage && <AddPackageCard onDone={() => setAddingPackage(false)} />}

      {initialPackages.length === 0 ? (
        <EmptyState
          icon={Ticket}
          title="No membership packages yet"
          hint="Packages set how many class credits a client is topped up with each week."
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {initialPackages.map((p) =>
            editingId === p.id ? (
              <EditPackageCard key={p.id} pkg={p} onClose={() => setEditingId(null)} onDelete={handleDelete} />
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
                  {p.credits_per_week} <span className="text-sm font-medium text-zinc-500">credits / week</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {p.credits_per_week} class{p.credits_per_week === 1 ? '' : 'es'} / week
                  {p.description ? ` · ${p.description}` : ''}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {p.included_screens ? `Restricted: ${p.included_screens.join(', ')}` : 'Full app access'}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
