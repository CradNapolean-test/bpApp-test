import { Skeleton } from '@/app/_components/Skeleton';
import { CoachRouteSkeleton } from '../_components/CoachRouteSkeleton';

export default function Loading() {
  return (
    <CoachRouteSkeleton>
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-9 w-28 rounded-full" />
        </div>
        <Skeleton className="h-9 w-full max-w-xs rounded-md" />
        <div className="space-y-2 rounded-2xl border border-black/10 p-3 dark:border-white/10">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-12 w-full rounded-lg" />
          ))}
        </div>
      </div>
    </CoachRouteSkeleton>
  );
}
