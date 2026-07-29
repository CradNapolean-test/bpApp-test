// Screens are grouped into categories rather than one flat tab bar. Chat isn't a screen
// at all — it's a floating popup (ChatPopup) visible from anywhere in the shell.
export type Screen =
  | 'Today'
  | 'Setup'
  | 'Weekly Log'
  | 'Habits'
  | 'Forms'
  | 'Food Tracking'
  | 'Meal Planner'
  | 'Activity'
  | 'Insights'
  | 'Overview'
  | 'Progress & Photos'
  | 'Workout'
  | 'Credits';

export type Category = 'Home' | 'Nutrition' | 'Training' | 'Accountability' | 'Progress' | 'Account Settings';
export const CATEGORY_ORDER: Category[] = ['Home', 'Nutrition', 'Training', 'Accountability', 'Progress', 'Account Settings'];

// Accountability = did-you-do-the-thing (check-ins, habits, coach-flagged insights);
// Progress = how-are-you-changing (trend lines, photos, measurements over time).
export function screensForCategory(category: Category, isCoachView: boolean): Screen[] {
  switch (category) {
    case 'Home':
      return ['Today'];
    case 'Nutrition':
      return ['Food Tracking', 'Meal Planner'];
    case 'Training':
      return ['Activity', 'Workout'];
    case 'Accountability':
      return ['Weekly Log', 'Habits', 'Forms', 'Insights'];
    case 'Progress':
      return ['Overview', 'Progress & Photos'];
    case 'Account Settings':
      return isCoachView ? ['Setup', 'Credits'] : ['Setup'];
  }
}
