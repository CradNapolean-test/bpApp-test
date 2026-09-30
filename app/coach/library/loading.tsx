import { Skeleton } from '@/app/_components/Skeleton';
import { CoachRouteSkeleton } from '../_components/CoachRouteSkeleton';

export default function Loading() {
  return (
    <CoachRouteSkeleton>
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </CoachRouteSkeleton>
  );
}
