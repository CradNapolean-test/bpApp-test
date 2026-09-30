import { Skeleton } from '@/app/_components/Skeleton';
import { CoachRouteSkeleton } from '../_components/CoachRouteSkeleton';

export default function Loading() {
  return (
    <CoachRouteSkeleton>
      <div className="space-y-4">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-9 w-64 rounded-lg" />
        <div className="space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-2xl" />
          ))}
        </div>
      </div>
    </CoachRouteSkeleton>
  );
}
