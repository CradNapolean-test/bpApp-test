'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { Switch } from '@/app/_components/Switch';
import { setScreenEnabled } from '@/lib/data/clientScreenSettings';
import { grantCredits } from '@/lib/data/classes';
import { DISABLEABLE_SCREENS } from '@/app/dashboard/_components/categories';
import type { Screen } from '@/app/dashboard/_components/categories';
import type { ClientExerciseMaxRow, ExerciseLibraryRow } from '@/lib/data/types';

function GrantCreditsCard({ clientId }: { clientId: string }) {
  const { run, busy } = useAction();
  const [amount, setAmount] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const delta = Number(amount);
    if (!delta) return;
    await run(() => grantCredits(clientId, delta, 'manual grant'), {
      success: `${delta > 0 ? '+' : ''}${delta} credits applied`,
      onDone: () => setAmount(''),
    });
  }

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <h3 className="font-bold text-black dark:text-zinc-50">Grant credits</h3>
      <form onSubmit={handleSubmit} className="mt-3 flex gap-2">
        <input
          type="number"
          placeholder="e.g. 2"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full min-w-0 flex-1 rounded-xl border border-black/10 bg-transparent px-3.5 py-2 text-sm dark:border-white/10"
        />
        <button
          type="submit"
          disabled={busy || !amount}
          // Explicit teal, not bg-accent -- this screen sets data-view="coach", which
          // reskins --accent to black/white (see Button.tsx's comment on the mechanism), but
          // the design keeps credit actions in the client-facing brand color specifically.
          className="shrink-0 rounded-full bg-[#19adb1] px-5 py-2 text-sm font-bold text-white disabled:opacity-50"
        >
          {busy ? 'Granting…' : 'Grant'}
        </button>
      </form>
    </div>
  );
}

function TestedMaxesCard({ maxes, library }: { maxes: ClientExerciseMaxRow[]; library: ExerciseLibraryRow[] }) {
  const libraryById = new Map(library.map((l) => [l.id, l]));
  const rows = [...maxes].sort(
    (a, b) => (libraryById.get(a.exercise_library_id)?.name ?? '').localeCompare(libraryById.get(b.exercise_library_id)?.name ?? '')
  );

  return (
    <div className="rounded-2xl border border-black/[.05] p-4 dark:border-white/10">
      <h3 className="font-bold text-black dark:text-zinc-50">Tested maxes</h3>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-500">No tested maxes on file yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-black/5 dark:divide-white/5">
          {rows.map((m) => (
            <li key={m.id} className="flex items-center justify-between py-1.5 text-sm">
              <span className="text-black dark:text-zinc-50">{libraryById.get(m.exercise_library_id)?.name ?? 'Unknown exercise'}</span>
              <span className="font-bold text-black dark:text-zinc-50">
                {m.tested_max} kg{m.reps > 1 ? ` (${m.reps}RM)` : ''}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ToolRow({
  clientId,
  screen,
  initialEnabled,
  readOnly,
  lockedByTier,
}: {
  clientId: string;
  screen: Screen;
  initialEnabled: boolean;
  readOnly: boolean;
  // True when the client's current membership tier excludes this screen -- the tier is a
  // ceiling this per-client toggle can't override (see categories.ts's
  // toEffectiveDisabledScreenSet), so flipping it back on here would silently do nothing.
  // Shown disabled with a note instead of letting a coach hit that dead end.
  lockedByTier: boolean;
}) {
  const { run, busy } = useAction();
  const [enabled, setEnabled] = useState(initialEnabled);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    await run(() => setScreenEnabled(clientId, screen, next));
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <div>
        <p className="text-sm font-medium text-black dark:text-zinc-50">{screen}</p>
        {lockedByTier && <p className="text-xs text-zinc-500">Locked by membership tier</p>}
      </div>
      <Switch
        checked={enabled}
        onChange={handleToggle}
        disabled={busy || readOnly || lockedByTier}
        label={`Toggle ${screen}`}
      />
    </div>
  );
}

// Real per-client toggles -- turning a screen off here removes it from the client's own
// dashboard nav entirely (sidebar, mobile strip, and every shortcut that jumps to it), see
// categories.ts's DISABLEABLE_SCREENS/screensForCategory and DashboardShell.tsx's
// effectiveScreen guard. No per-screen status line this pass -- see
// docs/PT_DISTINCTION_LAYOUT_ROADMAP.md's Phase 4 note on why.
export function ToolsTab({
  clientId,
  disabledScreens,
  tierIncludedScreens = null,
  clientExerciseMaxes,
  exerciseLibrary,
  readOnly = false,
}: {
  clientId: string;
  disabledScreens: string[];
  // The client's current membership package's included_screens -- null means no tier
  // restriction. See ToolRow's lockedByTier.
  tierIncludedScreens?: string[] | null;
  clientExerciseMaxes: ClientExerciseMaxRow[];
  exerciseLibrary: ExerciseLibraryRow[];
  readOnly?: boolean;
}) {
  const disabledSet = new Set(disabledScreens);
  const tierIncludedSet = tierIncludedScreens === null ? null : new Set(tierIncludedScreens);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {!readOnly && <GrantCreditsCard clientId={clientId} />}
        <TestedMaxesCard maxes={clientExerciseMaxes} library={exerciseLibrary} />
      </div>
      <div className="space-y-2">
        {DISABLEABLE_SCREENS.map((screen) => (
          <ToolRow
            key={screen}
            clientId={clientId}
            screen={screen}
            initialEnabled={!disabledSet.has(screen)}
            readOnly={readOnly}
            lockedByTier={tierIncludedSet !== null && !tierIncludedSet.has(screen)}
          />
        ))}
      </div>
    </div>
  );
}
