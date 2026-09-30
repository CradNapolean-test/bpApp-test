import { AppShell } from '@/app/_components/AppShell';
import { Skeleton } from '@/app/_components/Skeleton';
import { CoachBrand } from '@/app/coach/_components/CoachBrand';
import { CoachNav } from '@/app/coach/_components/CoachNav';

// This route renders DashboardShell (not the coach hub shell) once loaded, and its bottom
// bar is category state DashboardShell owns client-side -- nothing to render faithfully here
// yet, so this skeleton only commits to the topBar (CoachNav, data-independent) it actually
// shares with the loaded page, plus a generic body so the tap still gets instant feedback.
export default function Loading() {
  return (
    <AppShell title={<CoachBrand />} isCoachView topBar={<CoachNav />}>
      <div className="space-y-4">
        <Skeleton className="h-4 w-24" />
        <div className="flex items-center gap-3">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-56" />
          </div>
        </div>
        <Skeleton className="h-10 w-full rounded-lg" />
        <Skeleton className="h-64 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}
