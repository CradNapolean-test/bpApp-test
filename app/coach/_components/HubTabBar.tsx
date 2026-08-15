'use client';

// Underline-style sub-tab bar shared by the coach hub shells (Classes, Library) -- in-page
// state, not routes, same as WorkspaceTabBar one level down at the per-client workspace.
// Explicit teal underline rather than border-accent: these pages set no data-view, so
// border-accent would already resolve to teal here, but staying explicit keeps this
// component's look independent of that context-driven reskin (see WorkspaceTabBar.tsx's note
// on the same choice, made there because its page *does* set data-view="coach").
export function HubTabBar<T extends string>({
  tabs,
  active,
  onSelect,
}: {
  tabs: readonly T[];
  active: T;
  onSelect: (tab: T) => void;
}) {
  return (
    <div className="mb-4 flex w-max max-w-full gap-5 overflow-x-auto border-b border-black/[.06] dark:border-white/10">
      {tabs.map((tab) => {
        const isActive = active === tab;
        return (
          <button
            key={tab}
            type="button"
            onClick={() => onSelect(tab)}
            className={`shrink-0 whitespace-nowrap border-b-2 pb-2.5 text-sm transition-colors ${
              isActive
                ? 'border-[#19adb1] font-bold text-black dark:text-zinc-50'
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
