import { AppShell } from '@/app/_components/AppShell';
import { Skeleton } from '@/app/_components/Skeleton';
import { Logo } from '@/app/_components/Logo';

// DashboardShell's own topBar/bottomBar are category state it owns client-side, so this only
// commits to the parts that are genuinely static (the shell chrome) -- same reasoning as
// coach/clients/[clientId]/loading.tsx.
export default function Loading() {
  return (
    <AppShell title="Ballistic Performance" mobileHeader={<Logo size={28} />}>
      <div className="space-y-4">
        <Skeleton className="h-24 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
        <Skeleton className="h-40 w-full rounded-2xl" />
      </div>
    </AppShell>
  );
}
