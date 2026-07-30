import { Apple, CheckSquare, Dumbbell, House, Settings, TrendingUp } from 'lucide-react';

// Screens are grouped into categories rather than one flat tab bar. Chat isn't a screen
// at all — it's a floating popup (ChatPopup) visible from anywhere in the shell.
export type Screen =
  | 'Today'
  | 'Setup'
  | 'Weekly Log'
  | 'Forms'
  | 'Education'
  | 'Food Tracking'
  | 'Meal Planner'
  | 'Recipes'
  | 'Activity'
  | 'Insights'
  | 'Overview'
  | 'Progress & Photos'
  | 'Workout'
  | 'Credits';

export type Category = 'Home' | 'Nutrition' | 'Training' | 'Accountability' | 'Progress' | 'Account Settings';
export const CATEGORY_ORDER: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress', 'Account Settings'];

// The mobile bottom tab bar shows only these 5 -- Account Settings moves to a header icon
// instead (see BottomTabBar.tsx / AppShell.tsx), a typical tab bar can't comfortably fit 6.
export const BOTTOM_TAB_CATEGORIES: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress'];

export const CATEGORY_ICON: Record<Category, typeof House> = {
  Home: House,
  Nutrition: Apple,
  Training: Dumbbell,
  Accountability: CheckSquare,
  Progress: TrendingUp,
  'Account Settings': Settings,
};

// Accountability = did-you-do-the-thing (check-ins, habits, coach-flagged insights);
// Progress = how-are-you-changing (trend lines, photos, measurements over time).
export function screensForCategory(category: Category, isCoachView: boolean): Screen[] {
  switch (category) {
    case 'Home':
      return ['Today'];
    case 'Nutrition':
      return ['Food Tracking', 'Meal Planner', 'Recipes'];
    case 'Training':
      return ['Workout', 'Activity'];
    case 'Accountability':
      return ['Weekly Log', 'Forms', 'Education', 'Insights'];
    case 'Progress':
      return ['Overview', 'Progress & Photos'];
    case 'Account Settings':
      return isCoachView ? ['Setup', 'Credits'] : ['Setup'];
  }
}
