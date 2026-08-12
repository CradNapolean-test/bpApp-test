import { Activity, Apple, Camera, CalendarDays, CheckSquare, Dumbbell, TrendingUp } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { groupActivity } from '@/lib/utils/activityFeed';
import type { ActivityEventRow } from '@/lib/data/types';

const TYPE_ICON: Record<ActivityEventRow['event_type'], LucideIcon> = {
  measurement: TrendingUp,
  habit: CheckSquare,
  workout: Dumbbell,
  photo: Camera,
  booking: CalendarDays,
  food: Apple,
};

export function ActivityTab({ events }: { events: ActivityEventRow[] }) {
  const items = groupActivity(events).slice(0, 50);

  if (items.length === 0) {
    return <EmptyState icon={Activity} title="Nothing recent" hint="This client's recent activity will show up here." />;
  }

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const Icon = TYPE_ICON[item.type];
        return (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10">
              <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
            </span>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-black dark:text-zinc-50">{item.summary}</p>
            <p className="shrink-0 text-xs text-zinc-400">{new Date(item.occurredAt).toLocaleDateString()}</p>
          </div>
        );
      })}
    </div>
  );
}
