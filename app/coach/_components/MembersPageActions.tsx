'use client';

import { createContext, useContext, useEffect, useRef, type MutableRefObject, type ReactNode } from 'react';

// The Members page has one "⋯" menu, in its header (CL1). Two of its items act on the list below it (Export CSV exports what the list is
// showing; Manage groups opens over it), so the list hands the menu those two actions through this.
export interface MembersListActions {
  exportCsv: () => void;
  manageGroups: () => void;
}

const MembersListActionsContext = createContext<MutableRefObject<MembersListActions | null> | null>(null);

export function MembersPageActionsProvider({ children }: { children: ReactNode }) {
  const actions = useRef<MembersListActions | null>(null);
  return <MembersListActionsContext.Provider value={actions}>{children}</MembersListActionsContext.Provider>;
}

// The menu: the list's actions, or null when no list is showing.
export function useMembersListActions(): MutableRefObject<MembersListActions | null> | null {
  return useContext(MembersListActionsContext);
}

// The list: keeps the menu pointed at its latest actions (they read the list's current filters).
export function useProvideMembersListActions(actions: MembersListActions): void {
  const ref = useContext(MembersListActionsContext);
  useEffect(() => {
    if (!ref) return;
    ref.current = actions;
  });
  useEffect(() => {
    if (!ref) return;
    return () => {
      ref.current = null;
    };
  }, [ref]);
}
