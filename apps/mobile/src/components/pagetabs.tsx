import { useRouter, type Href } from 'expo-router';

import { PillTabs } from '@/components/ui';
import { useScreenAccess } from '@/lib/screens';
import { useClientProfile } from '@/lib/today';

// The web groups some pages under one title with a row of pills (Nutrition: Food Tracking / Meal Planner / Recipes, Training:
// Workout / Activity, Check-in: Weekly Log / Forms). Each page here is its own screen; these rows sit at the top of each and
// switch between them. A pill is left out when this member's plan or coach has that page switched off, and the row is left out
// when fewer than two pills remain (as on the web).
type Page<T extends string> = { value: T; label: string; href: Href; show: boolean };

function PageRow<T extends string>({ current, pages }: { current: T; pages: Page<T>[] }) {
  const router = useRouter();
  const shown = pages.filter((p) => p.show || p.value === current);
  if (shown.length < 2) return null;
  return (
    <PillTabs
      value={current}
      options={shown}
      onChange={(v) => {
        const page = shown.find((p) => p.value === v);
        if (page) router.navigate(page.href);
      }}
    />
  );
}

export function NutritionTabs({ current }: { current: 'food' | 'meal-plan' | 'recipes' }) {
  const { areas } = useScreenAccess();
  const mode = useClientProfile().data?.nutrition_tracking_mode ?? 'full_tracking';
  // The meal planner and recipes belong to full food tracking (the web shows them only then).
  const full = mode === 'full_tracking';
  return (
    <PageRow
      current={current}
      pages={[
        { value: 'food', label: 'Food Tracking', href: '/food', show: areas.food },
        { value: 'meal-plan', label: 'Meal Planner', href: '/meal-plan', show: areas.mealPlanner && full },
        { value: 'recipes', label: 'Recipes', href: '/recipes', show: areas.recipes && full },
      ]}
    />
  );
}

export function TrainingTabs({ current }: { current: 'workouts' | 'activity' }) {
  const { areas } = useScreenAccess();
  return (
    <PageRow
      current={current}
      pages={[
        { value: 'workouts', label: 'Workout', href: '/workouts', show: areas.workouts },
        { value: 'activity', label: 'Activity', href: '/activity', show: areas.activity },
      ]}
    />
  );
}

export function CheckinTabs({ current }: { current: 'checkin' | 'forms' }) {
  const { areas } = useScreenAccess();
  return (
    <PageRow
      current={current}
      pages={[
        { value: 'checkin', label: 'Weekly Log', href: '/checkin', show: areas.weeklyLog },
        { value: 'forms', label: 'Forms', href: '/forms', show: areas.forms },
      ]}
    />
  );
}
