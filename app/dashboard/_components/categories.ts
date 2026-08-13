import { Apple, Bell, CheckSquare, Dumbbell, House, MessageSquare, Settings, TrendingUp } from 'lucide-react';

// Screens are grouped into categories rather than one flat tab bar.
export type Screen =
  | 'Today'
  | 'Setup'
  | 'Account'
  | 'Info'
  | 'Weekly Log'
  | 'Forms'
  | 'Education'
  | 'Food Tracking'
  | 'Meal Planner'
  | 'Recipes'
  | 'Photo Diary'
  | 'Activity'
  | 'Insights'
  | 'Overview'
  | 'Progress & Photos'
  | 'Workout'
  | 'Credits'
  | 'Messages'
  | 'Notifications';

export type Category = 'Home' | 'Nutrition' | 'Training' | 'Accountability' | 'Progress' | 'Messages' | 'Account Settings' | 'Notifications';
export const CATEGORY_ORDER: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress', 'Messages', 'Account Settings', 'Notifications'];

// The mobile bottom tab bar shows only these 5 -- Messages, Account Settings and
// Notifications move to header icons instead (see BottomTabBar.tsx / DashboardShell.tsx), a
// tab bar can't comfortably fit 8.
export const BOTTOM_TAB_CATEGORIES: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress'];

export const CATEGORY_ICON: Record<Category, typeof House> = {
  Home: House,
  Nutrition: Apple,
  Training: Dumbbell,
  Accountability: CheckSquare,
  Progress: TrendingUp,
  Messages: MessageSquare,
  'Account Settings': Settings,
  Notifications: Bell,
};

// Coach-toggleable via the Tools tab (CoachClientWorkspace) -- Today/Setup/Account/Credits/
// Messages are core infrastructure and stay permanently on, matching PT Distinction's own
// Tools tab (only ever toggles tracking modules, never account/billing screens).
export const DISABLEABLE_SCREENS: Screen[] = [
  'Food Tracking',
  'Meal Planner',
  'Recipes',
  'Workout',
  'Activity',
  'Weekly Log',
  'Forms',
  'Education',
  'Insights',
  'Overview',
  'Progress & Photos',
];

// Narrows + defensively filters raw DB strings against the real allowlist, so a stray/stale
// row can never accidentally hide a core screen.
export function toDisabledScreenSet(raw: string[]): Set<Screen> {
  const allowed = new Set(DISABLEABLE_SCREENS);
  return new Set(raw.filter((s): s is Screen => allowed.has(s as Screen)));
}

export type NutritionTrackingMode = 'full_tracking' | 'manual_import' | 'photo_diary';

// Accountability = did-you-do-the-thing (check-ins, habits, coach-flagged insights);
// Progress = how-are-you-changing (trend lines, photos, measurements over time).
export function screensForCategory(
  category: Category,
  isCoachView: boolean,
  disabledScreens: Set<Screen> = new Set(),
  nutritionMode: NutritionTrackingMode = 'full_tracking'
): Screen[] {
  const screens = ((): Screen[] => {
    switch (category) {
      case 'Home':
        return ['Today'];
      case 'Nutrition':
        // manual_import shows the same Food Tracking screen, but FoodTrackingTab branches
        // internally to a simple per-section macro-entry form instead of the food-search
        // diary. photo_diary swaps the granular per-food screens for the photo-based one.
        if (nutritionMode === 'manual_import') return ['Food Tracking'];
        if (nutritionMode === 'photo_diary') return ['Photo Diary'];
        return ['Food Tracking', 'Meal Planner', 'Recipes'];
      case 'Training':
        return ['Workout', 'Activity'];
      case 'Accountability':
        return ['Weekly Log', 'Forms', 'Education', 'Insights'];
      case 'Progress':
        return ['Overview', 'Progress & Photos'];
      case 'Messages':
        return ['Messages'];
      case 'Notifications':
        return ['Notifications'];
      case 'Account Settings':
        // 'Account' (password/email/notifications/theme) operates on the *logged-in* auth
        // session -- shown only on the client's own dashboard. A coach viewing a client here
        // must never see it: clicking "change password" would silently change the COACH's own
        // password, not the client's, since supabase.auth.updateUser() always targets whoever
        // is actually signed in.
        return isCoachView ? ['Setup', 'Credits', 'Info'] : ['Setup', 'Account', 'Credits'];
    }
  })();
  return screens.filter((s) => !disabledScreens.has(s));
}
