'use client';

import { WORKSPACE_TAB_ICON, WORKSPACE_TAB_ORDER } from './tabs';
import type { WorkspaceTab } from './tabs';

// In-page state, not routes -- unlike CoachNav (which this mirrors visually), these buttons
// switch activeTab within CoachClientWorkspace rather than navigating.
export function WorkspaceTabBar({
  active,
  onSelect,
}: {
  active: WorkspaceTab;
  onSelect: (tab: WorkspaceTab) => void;
}) {
  const btnCls = (isActive: boolean) =>
    `flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 py-2 text-sm font-medium transition-colors ${
      isActive
        ? 'bg-accent text-accent-foreground shadow-sm'
        : 'text-zinc-500 hover:bg-black/5 hover:text-black dark:hover:bg-white/5 dark:hover:text-zinc-300'
    }`;

  return (
    <div className="mb-4 flex w-max max-w-full gap-1 overflow-x-auto rounded-2xl bg-black/[.02] p-1.5 dark:bg-white/[.03]">
      {WORKSPACE_TAB_ORDER.map((tab) => {
        const Icon = WORKSPACE_TAB_ICON[tab];
        return (
          <button key={tab} onClick={() => onSelect(tab)} className={btnCls(active === tab)}>
            <Icon className="h-4 w-4" />
            {tab}
          </button>
        );
      })}
    </div>
  );
}
