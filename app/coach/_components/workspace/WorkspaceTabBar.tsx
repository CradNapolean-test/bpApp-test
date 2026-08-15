'use client';

import { WORKSPACE_TAB_ORDER } from './tabs';
import type { WorkspaceTab } from './tabs';

// In-page state, not routes -- unlike CoachNav (which this used to mirror visually as a pill
// bar), these buttons switch activeTab within CoachClientWorkspace rather than navigating.
// Underline style now, matching the design handoff's per-client workspace tabs (distinct from
// CoachNav's own pill treatment one level up, so the two navigation levels read differently).
export function WorkspaceTabBar({
  active,
  onSelect,
}: {
  active: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  return (
    <div className="mb-4 flex w-max max-w-full gap-5 overflow-x-auto border-b border-black/[.06] dark:border-white/10">
      {WORKSPACE_TAB_ORDER.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            onClick={() => onSelect(tab)}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
              isActive
                ? // Explicit teal, not border-accent -- this page sets data-view="coach" (see
                  // ToolsTab.tsx's Grant button for the same note), but the design keeps this
                  // underline in the client-facing brand color even here.
                  'border-[#19adb1] font-bold text-black dark:text-zinc-50'
                : 'border-transparent font-medium text-zinc-500 hover:text-black dark:hover:text-zinc-300'
            }`}
          >
            {tab}
          </button>
        );
      })}
    </div>
  );
}
