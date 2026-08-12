'use client';

import { useState } from 'react';
import { useAction } from '@/app/_components/useAction';
import { setScreenEnabled } from '@/lib/data/clientScreenSettings';
import { DISABLEABLE_SCREENS } from '@/app/dashboard/_components/categories';
import type { Screen } from '@/app/dashboard/_components/categories';

function ToolRow({ clientId, screen, initialEnabled }: { clientId: string; screen: Screen; initialEnabled: boolean }) {
  const { run, busy } = useAction();
  const [enabled, setEnabled] = useState(initialEnabled);

  async function handleToggle() {
    const next = !enabled;
    setEnabled(next);
    await run(() => setScreenEnabled(clientId, screen, next));
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
      <p className="text-sm font-medium text-black dark:text-zinc-50">{screen}</p>
      <button
        role="switch"
        aria-checked={enabled}
        aria-label={`Toggle ${screen}`}
        disabled={busy}
        onClick={handleToggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${
          enabled ? 'bg-accent' : 'bg-black/15 dark:bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </div>
  );
}

// Real per-client toggles -- turning a screen off here removes it from the client's own
// dashboard nav entirely (sidebar, mobile strip, and every shortcut that jumps to it), see
// categories.ts's DISABLEABLE_SCREENS/screensForCategory and DashboardShell.tsx's
// effectiveScreen guard. No per-screen status line this pass -- see
// docs/PT_DISTINCTION_LAYOUT_ROADMAP.md's Phase 4 note on why.
export function ToolsTab({ clientId, disabledScreens }: { clientId: string; disabledScreens: string[] }) {
  const disabledSet = new Set(disabledScreens);

  return (
    <div className="space-y-2">
      {DISABLEABLE_SCREENS.map((screen) => (
        <ToolRow key={screen} clientId={clientId} screen={screen} initialEnabled={!disabledSet.has(screen)} />
      ))}
    </div>
  );
}
