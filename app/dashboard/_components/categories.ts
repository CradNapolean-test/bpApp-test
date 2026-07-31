import { Apple, CheckSquare, Dumbbell, House, MessageSquare, Settings, TrendingUp } from 'lucide-react';

// Screens are grouped into categories rather than one flat tab bar.
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
  | 'Credits'
  | 'Messages';

export type Category = 'Home' | 'Nutrition' | 'Training' | 'Accountability' | 'Progress' | 'Messages' | 'Account Settings';
export const CATEGORY_ORDER: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress', 'Messages', 'Account Settings'];

// The mobile bottom tab bar shows only these 5 -- Messages and Account Settings move to
// header icons instead (see BottomTabBar.tsx / DashboardShell.tsx), a tab bar can't
// comfortably fit 7.
export const BOTTOM_TAB_CATEGORIES: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress'];

export const CATEGORY_ICON: Record<Category, typeof House> = {
  Home: House,
  Nutrition: Apple,
  Training: Dumbbell,
  Accountability: CheckSquare,
  Progress: TrendingUp,
  Messages: MessageSquare,
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
    case 'Messages':
      return ['Messages'];
    case 'Account Settings':
      return isCoachView ? ['Setup', 'Credits'] : ['Setup'];
  }
}
