'use client';

import { useState } from 'react';
import { BottomSheet } from '@/app/_components/BottomSheet';
import { Button } from '@/app/_components/Button';
import { useAction } from '@/app/_components/useAction';
import { saveCustomTargets, setCustomTargetsLocked } from '@/lib/data/clientProfile';
import { TARGETS_LOCKED_MESSAGE, parseCustomTargets } from '@/lib/utils/customTargets';
import type { ClientProfileRow } from '@/lib/data/types';

const inputCls =
  'w-full rounded-xl border border-black/10 bg-card px-3 py-2.5 text-base text-black dark:border-white/15 dark:text-zinc-50 disabled:opacity-60';

const text = (n: number | null | undefined) => (n == null ? '' : String(n));

// Set the daily calorie and macro targets by hand, instead of the calculated ones. A member can do it for themselves unless their coach
// has locked it; a coach can set or clear them for the member and lock or unlock the member's ability to change them.
export function CustomTargetsSheet({
  clientId,
  profile,
  isCoach,
  onClose,
}: {
  clientId: string;
  profile: ClientProfileRow | null;
  isCoach: boolean;
  onClose: () => void;
}) {
  const { run, busy } = useAction();
  const [calories, setCalories] = useState(text(profile?.custom_calories));
  const [protein, setProtein] = useState(text(profile?.custom_protein));
  const [carbs, setCarbs] = useState(text(profile?.custom_carbs));
  const [fat, setFat] = useState(text(profile?.custom_fat));
  const [locked, setLocked] = useState(profile?.custom_targets_locked ?? false);
  const [problem, setProblem] = useState<string | null>(null);

  const memberBlocked = !isCoach && locked;
  const hasCustom = profile?.custom_calories != null;

  async function save() {
    const parsed = parseCustomTargets({ calories, protein, carbs, fat });
    if (!parsed.ok) {
      setProblem(parsed.error);
      return;
    }
    setProblem(null);
    await run(
      async () => {
        const saved = await saveCustomTargets(clientId, parsed.value);
        if (!saved.ok) return saved;
        // Only a coach can change the lock; a member's own save never sends it.
        return isCoach && locked !== (profile?.custom_targets_locked ?? false) ? setCustomTargetsLocked(clientId, locked) : saved;
      },
      { success: 'Daily targets saved', onDone: onClose }
    );
  }

  async function useCalculated() {
    await run(
      async () => {
        const cleared = await saveCustomTargets(clientId, null);
        if (!cleared.ok) return cleared;
        return isCoach && locked !== (profile?.custom_targets_locked ?? false) ? setCustomTargetsLocked(clientId, locked) : cleared;
      },
      { success: 'Back to the calculated targets', onDone: onClose }
    );
  }

  async function saveLockOnly() {
    await run(() => setCustomTargetsLocked(clientId, locked), { success: locked ? 'Member can no longer change their targets' : 'Member can change their targets', onDone: onClose });
  }

  return (
    <BottomSheet title={isCoach ? 'Daily targets (override)' : 'My daily targets'} onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-zinc-500">
          {isCoach
            ? 'These replace the calculated targets for this member everywhere in the app. Leave them empty to use the calculated ones.'
            : 'Set your own daily calories and macros. They replace the calculated targets until you switch back.'}
        </p>
        {memberBlocked && <p className="rounded-xl bg-card-muted px-3 py-2 text-xs font-semibold text-zinc-600 dark:text-zinc-400">{TARGETS_LOCKED_MESSAGE}</p>}
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-zinc-500">
            Calories (optional)
            <input className={inputCls} inputMode="decimal" placeholder="from macros" disabled={memberBlocked} value={calories} onChange={(e) => setCalories(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Protein (g)
            <input className={inputCls} inputMode="decimal" disabled={memberBlocked} value={protein} onChange={(e) => setProtein(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Carbs (g)
            <input className={inputCls} inputMode="decimal" disabled={memberBlocked} value={carbs} onChange={(e) => setCarbs(e.target.value)} />
          </label>
          <label className="text-xs font-semibold text-zinc-500">
            Fat (g)
            <input className={inputCls} inputMode="decimal" disabled={memberBlocked} value={fat} onChange={(e) => setFat(e.target.value)} />
          </label>
        </div>
        {isCoach && (
          <label className="flex items-start gap-2.5 rounded-xl border border-black/10 p-3 text-sm dark:border-white/15">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={locked} onChange={(e) => setLocked(e.target.checked)} />
            <span>
              <span className="font-bold text-black dark:text-zinc-50">Stop this member setting their own targets</span>
              <span className="block text-xs text-zinc-500">They will see the targets but not be able to change them.</span>
            </span>
          </label>
        )}
        {problem && <p className="text-sm font-semibold text-danger">{problem}</p>}
        <Button className="w-full" disabled={busy || memberBlocked} onClick={() => void save()}>
          {busy ? 'Saving...' : 'Save targets'}
        </Button>
        {hasCustom && (
          <button
            type="button"
            disabled={busy || memberBlocked}
            onClick={() => void useCalculated()}
            className="w-full rounded-xl border border-black/10 py-2.5 text-sm font-bold text-zinc-600 disabled:opacity-50 dark:border-white/15 dark:text-zinc-300"
          >
            Use the calculated targets instead
          </button>
        )}
        {isCoach && !protein && !carbs && !fat && locked !== (profile?.custom_targets_locked ?? false) && (
          <button type="button" disabled={busy} onClick={() => void saveLockOnly()} className="w-full text-sm font-bold text-accent">
            Save just the lock setting
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
