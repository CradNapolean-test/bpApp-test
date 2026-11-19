import type { DashboardScope } from './data/coachDashboard';

// The coach dashboard's address for one scope: My members, Whole gym, or one coach's members (gym admins only).
export function dashboardScopeHref(scope: DashboardScope, coachId: string | null = null): string {
  return `/coach?scope=${scope}${scope === 'coach' && coachId ? `&coach=${encodeURIComponent(coachId)}` : ''}`;
}

// Which figures a loaded dashboard holds: its scope and, for one coach's members, which coach. Two loads with the same key show the same
// members, so the figures of one can stand in for the other while it loads.
export function dashboardScopeKey(scope: DashboardScope, coachId: string | null = null): string {
  return scope === 'coach' ? `coach:${coachId ?? ''}` : scope;
}
