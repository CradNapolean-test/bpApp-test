import { Activity, CalendarDays, ClipboardList, Info, MessageCircle, Wrench } from 'lucide-react';

// Mirrors app/dashboard/_components/categories.ts's shape, but for the coach-only per-client
// workspace (CoachClientWorkspace) instead of the client's own dashboard. Only 'Info' has
// real content so far -- see docs/PT_DISTINCTION_LAYOUT_ROADMAP.md for the phase plan.
export type WorkspaceTab = 'Activity' | 'Schedule' | 'Items' | 'Tools' | 'Communications' | 'Info';

export const WORKSPACE_TAB_ORDER: WorkspaceTab[] = ['Activity', 'Schedule', 'Items', 'Tools', 'Communications', 'Info'];

export const WORKSPACE_TAB_ICON: Record<WorkspaceTab, typeof Activity> = {
  Activity: Activity,
  Schedule: CalendarDays,
  Items: ClipboardList,
  Tools: Wrench,
  Communications: MessageCircle,
  Info: Info,
};
