import { Skeleton } from '@/app/_components/Skeleton';
import { CoachRouteSkeleton } from './_components/CoachRouteSkeleton';

export default function Loading() {
  return (
    <CoachRouteSkeleton>
      <div className="space-y-4">
        <Skeleton className="hidden h-8 w-48 md:block" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
          <Skeleton className="h-20 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_20rem]">
          <Skeleton className="h-72 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Skeleton className="h-48 rounded-2xl" />
          <Skeleton className="h-48 rounded-2xl" />
        </div>
      </div>
    </CoachRouteSkeleton>
  );
}
