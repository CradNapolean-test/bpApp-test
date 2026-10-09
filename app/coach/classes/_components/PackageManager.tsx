'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Ticket } from 'lucide-react';
import { Button } from '@/app/_components/Button';
import { DropdownMenu } from '@/app/_components/DropdownMenu';
import { useAction } from '@/app/_components/useAction';
import { useConfirm } from '@/app/_components/ConfirmDialog';
import { useToast } from '@/app/_components/ToastProvider';
import { EmptyState } from '@/app/_components/EmptyState';
import { createPackage, deletePackage, updatePackage } from '@/lib/data/memberships';
import { DISABLEABLE_SCREENS } from '@/app/dashboard/_components/categories';
import type { MembershipPackageRow } from '@/lib/data/types';
import { inputCls } from '@/app/_components/ui';


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
  inUse,
  onClose,
  onDelete,
}: {
  pkg: MembershipPackageRow;
  // How many members are on this plan right now.
  inUse: number;
  onClose: () => void;
  onDelete: (id: string, name: string) => void;
}) {
  const { run, busy: saving } = useAction();
  const confirm = useConfirm();
  const [name, setName] = useState(pkg.name);
  const [creditsPerWeek, setCreditsPerWeek] = useState(pkg.credits_per_week);
  const [description, setDescription] = useState(pkg.description ?? '');
  const [advanceDays, setAdvanceDays] = useState<string>(pkg.advance_booking_days?.toString() ?? '');
  const [durationWeeks, setDurationWeeks] = useState<string>(pkg.duration_weeks?.toString() ?? '');
  const [screens, setScreens] = useState<Set<string>>(new Set(pkg.included_screens ?? DISABLEABLE_SCREENS));

  // What this save would change, in words, so a plan other people are on is never changed blind.
  function describeChanges(): string[] {
    const out: string[] = [];
    const limit = (n: number | null) => (n == null ? 'no limit' : `${n} days`);
    const length = (n: number | null) => (n == null ? 'ongoing' : `${n} weeks`);
    if (name.trim() !== pkg.name) out.push(`name: ${pkg.name} to ${name.trim()}`);
    if (creditsPerWeek !== pkg.credits_per_week) out.push(`credits per week: ${pkg.credits_per_week} to ${creditsPerWeek}`);
    const newAdv = advanceDays ? Number(advanceDays) : null;
    if (newAdv !== (pkg.advance_booking_days ?? null)) out.push(`booking window: ${limit(pkg.advance_booking_days ?? null)} to ${limit(newAdv)}`);
    const newLen = durationWeeks ? Number(durationWeeks) : null;
    if (newLen !== (pkg.duration_weeks ?? null)) out.push(`length: ${length(pkg.duration_weeks ?? null)} to ${length(newLen)}`);
    const before = new Set<string>(pkg.included_screens ?? DISABLEABLE_SCREENS);
    if (before.size !== screens.size || [...screens].some((x) => !before.has(x))) out.push('which screens members can use');
    return out;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    const changes = describeChanges();
    if (inUse > 0 && changes.length > 0) {
      const ok = await confirm({
        title: `Change “${pkg.name}”?`,
        body: `${inUse} member${inUse === 1 ? ' is' : 's are'} on this plan, so this changes things for ${inUse === 1 ? 'them' : 'all of them'} straight away: ${changes.join('; ')}.`,
        confirmLabel: 'Save changes',
      });
      if (!ok) return;
    }
    await run(
      () =>
        updatePackage(pkg.id, {
          name: name.trim(),
          credits_per_week: creditsPerWeek,
          description: description || null,
          advance_booking_days: advanceDays ? Number(advanceDays) : null,
          // Only sent when it matters, so this still saves before migration 0088 is applied.
          ...(durationWeeks !== '' || pkg.duration_weeks != null ? { duration_weeks: durationWeeks ? Number(durationWeeks) : null } : {}),
          included_screens: screensToIncludedScreens(screens),
        }),
      { success: 'Package updated', onDone: onClose }
    );
  }

  return (
    <div className="rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
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
          <label className="text-xs font-medium text-zinc-500">Book up to (days ahead, blank = no limit)</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={advanceDays}
            onChange={(e) => setAdvanceDays(e.target.value)}
            placeholder="e.g. 14"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-zinc-500">Length in weeks (blank = ongoing, e.g. 6 for the challenge)</label>
          <input
            type="number"
            min={1}
            className={inputCls}
            value={durationWeeks}
            onChange={(e) => setDurationWeeks(e.target.value)}
            placeholder="e.g. 6"
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
  const [advanceDays, setAdvanceDays] = useState('');
  const [durationWeeks, setDurationWeeks] = useState('');
  const [screens, setScreens] = useState<Set<string>>(new Set(DISABLEABLE_SCREENS));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await runCreate(
      () =>
        createPackage({
          name,
          credits_per_week: creditsPerWeek,
          description: description || null,
          advance_booking_days: advanceDays ? Number(advanceDays) : null,
          ...(durationWeeks ? { duration_weeks: Number(durationWeeks) } : {}),
          included_screens: screensToIncludedScreens(screens),
        }),
      { success: 'Package added', onDone }
    );
  }

  return (
    <form onSubmit={handleCreate} className="space-y-3 rounded-2xl border border-black/[.05] bg-card p-4 dark:border-white/10">
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
        <label className="text-xs font-medium text-zinc-500">Book up to (days ahead, blank = no limit)</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={advanceDays}
          onChange={(e) => setAdvanceDays(e.target.value)}
          placeholder="e.g. 14"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-zinc-500">Length in weeks (blank = ongoing, e.g. 6 for the challenge)</label>
        <input
          type="number"
          min={1}
          className={inputCls}
          value={durationWeeks}
          onChange={(e) => setDurationWeeks(e.target.value)}
          placeholder="e.g. 6"
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

export function PackageManager({
  initialPackages,
  memberCounts = {},
  countsById = null,
}: {
  initialPackages: MembershipPackageRow[];
  // By plan name, from the admin overview (fallback only).
  memberCounts?: Record<string, number>;
  // By plan id, for every coach (needs migration 0101).
  countsById?: Record<string, number> | null;
}) {
  const confirm = useConfirm();
  const toast = useToast();
  const countOf = (p: MembershipPackageRow): number | null => (countsById ? (countsById[p.id] ?? 0) : memberCounts[p.name] ?? null);
  const { run: runDelete } = useAction();
  const [addingPackage, setAddingPackage] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  async function handleDelete(id: string, packageName: string) {
    const pkg = initialPackages.find((x) => x.id === id);
    const n = pkg ? countOf(pkg) : null;
    if (n != null && n > 0) {
      toast.error(`${n} member${n === 1 ? ' is' : 's are'} still on “${packageName}”. Move them to another plan first (their Profile, Credits & plan, Change plan).`);
      return;
    }
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
          className="shrink-0 rounded-full bg-accent px-4 py-2 text-sm font-bold text-accent-foreground hover:opacity-90"
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
              <EditPackageCard key={p.id} pkg={p} inUse={countOf(p) ?? 0} onClose={() => setEditingId(null)} onDelete={handleDelete} />
            ) : (
              <div
                key={p.id}
                className="rounded-2xl border border-black/[.05] bg-card p-4 shadow-[0_1px_2px_rgba(0,0,0,.02)] dark:border-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-black dark:text-zinc-50">{p.name}</p>
                  <div className="-mr-1 -mt-1 flex shrink-0 items-center gap-1 text-sm font-semibold">
                    <button type="button" onClick={() => setEditingId(p.id)} className="rounded-full px-2.5 py-1 text-accent hover:bg-accent/10">
                      Edit
                    </button>
                    <DropdownMenu
                      triggerLabel={`More actions for ${p.name}`}
                      items={[{ label: 'Delete plan', destructive: true, onSelect: () => handleDelete(p.id, p.name) }]}
                    />
                  </div>
                </div>
                <p className="mt-2 text-2xl font-extrabold text-accent">
                  {p.credits_per_week} <span className="text-sm font-medium text-zinc-500">credits / week</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {p.advance_booking_days ? `Book up to ${p.advance_booking_days} days ahead` : 'No booking limit'}{p.duration_weeks ? ` · ${p.duration_weeks} weeks` : ''}
                  {p.description ? ` · ${p.description}` : ''}
                </p>
                <p className="mt-1 text-xs text-zinc-400">
                  {p.included_screens
                    ? `Not included: ${DISABLEABLE_SCREENS.filter((s) => !p.included_screens!.includes(s)).join(', ') || 'nothing'}`
                    : 'Full app access'}
                  {countOf(p) != null && (
                    <>
                      {' · '}
                      {countOf(p)! > 0 ? (
                        <Link href={`/coach/clients?plan=${encodeURIComponent(p.name)}&scope=gym`} className="font-semibold text-accent">
                          {countOf(p)} member{countOf(p) === 1 ? '' : 's'}
                        </Link>
                      ) : (
                        'no members'
                      )}
                    </>
                  )}
                </p>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
}
