import { Dumbbell, FileText, GraduationCap, CheckSquare } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/app/_components/EmptyState';
import { courseCompletionPercent } from '@/lib/utils/educationProgress';
import { adherencePercent } from '@/lib/utils/habitStats';
import type {
  EducationCourseAssignmentWithDetails,
  FormAssignmentWithDetails,
  HabitWithLogs,
  WorkoutProgramRow,
} from '@/lib/data/types';

interface ItemRow {
  icon: LucideIcon;
  name: string;
  status: string;
  date: string;
}

// Read-only, consolidated across everything assigned to this client -- see
// docs/PT_DISTINCTION_LAYOUT_ROADMAP.md's Phase 2 scope note: no click-through into these
// yet, purely informational this phase.
export function ItemsTab({
  programs,
  formAssignments,
  educationAssignments,
  habits,
}: {
  programs: WorkoutProgramRow[];
  formAssignments: FormAssignmentWithDetails[];
  educationAssignments: EducationCourseAssignmentWithDetails[];
  habits: HabitWithLogs[];
}) {
  const rows: ItemRow[] = [
    ...programs.map((p) => {
      const maxWeek = Math.max(0, ...p.workout_program_days.map((d) => d.week_num));
      return {
        icon: Dumbbell,
        name: p.name,
        status: `${p.workout_program_days.length} days across ${maxWeek} weeks`,
        date: p.created_at,
      };
    }),
    ...formAssignments.map((a) => ({
      icon: FileText,
      name: a.template.name,
      status: a.completed_at ? 'Completed' : 'Pending',
      date: a.assigned_at,
    })),
    ...educationAssignments.map((a) => ({
      icon: GraduationCap,
      name: a.course.title,
      status: `${courseCompletionPercent(a.course, a.completions)}% complete`,
      date: a.assigned_at,
    })),
    ...habits.map((h) => ({
      icon: CheckSquare,
      name: h.name,
      status: `${adherencePercent(h.logs)}% (30d)`,
      date: h.created_at,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));

  if (rows.length === 0) {
    return <EmptyState icon={Dumbbell} title="Nothing assigned yet" hint="Programs, forms, education, and habits assigned to this client will show up here." />;
  }

  return (
    <div className="space-y-2">
      {rows.map((row, i) => {
        const Icon = row.icon;
        return (
          <div
            key={i}
            className="flex items-center gap-3 rounded-lg border border-black/10 p-3 dark:border-white/10"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-black/5 dark:bg-white/10">
              <Icon className="h-4 w-4 text-zinc-600 dark:text-zinc-300" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-black dark:text-zinc-50">{row.name}</p>
              <p className="text-xs text-zinc-500">{row.status}</p>
            </div>
            <p className="shrink-0 text-xs text-zinc-400">{new Date(row.date).toLocaleDateString()}</p>
          </div>
        );
      })}
    </div>
  );
}
