import { ArrowDownToLine, ArrowUpFromLine, Dumbbell, HeartPulse, PersonStanding, Shield, Users, Waves } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const MUSCLE_GROUPS = ['Push', 'Pull', 'Legs', 'Core', 'Cardio', 'Full Body', 'Mobility'] as const;

// What a coach sees the field called (LB8). The values are movement patterns, not muscles; it is stored as exercise_library.muscle_group,
// which stays as it is (only the label changed).
export const MOVEMENT_LABEL = 'Movement';

// Direct object lookup (not a function call) at every call site -- `<Icon />` needs a
// statically-stable reference for react-hooks/static-components, matching the existing
// CATEGORY_ICON[c] pattern in dashboard/_components/BottomTabBar.tsx.
export const MUSCLE_GROUP_ICONS: Record<string, LucideIcon> = {
  Push: ArrowUpFromLine,
  Pull: ArrowDownToLine,
  Legs: PersonStanding,
  Core: Shield,
  Cardio: HeartPulse,
  'Full Body': Users,
  Mobility: Waves,
};

export { Dumbbell as DefaultMuscleGroupIcon };
