import { Activity, CalendarDays, ClipboardList, Info, NotebookPen, Wrench } from 'lucide-react';

// Mirrors app/dashboard/_components/categories.ts's shape, but for the coach-only per-client
// workspace (CoachClientWorkspace) instead of the client's own dashboard.
export type WorkspaceTab = 'Info' | 'Schedule' | 'Items' | 'Tools' | 'Notes' | 'Activity';

export const WORKSPACE_TAB_ORDER: WorkspaceTab[] = ['Info', 'Schedule', 'Items', 'Tools', 'Notes', 'Activity'];

export const WORKSPACE_TAB_ICON: Record<WorkspaceTab, typeof Activity> = {
  Info: Info,
  Schedule: CalendarDays,
  Items: ClipboardList,
  Tools: Wrench,
  Notes: NotebookPen,
  Activity: Activity,
};
