// Which screens a member may see. A coach can switch a screen off for one member (client_disabled_screens), and a
// membership package can limit the screens its tier includes (membership_packages.included_screens). Both ways of
// hiding a screen are product rules rather than security: Row Level Security is what actually protects the data.

export type Screen =
  | 'Today'
  | 'Setup'
  | 'Account'
  | 'Info'
  | 'Big Dog'
  | 'Coaching'
  | 'Events'
  | 'Feedback'
  | 'Refer a Friend'
  | 'Rewards'
  | 'FAQs'
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
  | 'Strength'
  | 'Progress & Photos'
  | 'Body Scans'
  | 'Workout'
  | 'Credits'
  | 'Messages'
  | 'Notifications';

// Coach-toggleable from the client dashboard nav -- Today/Setup/Account/Credits/Messages are core
// infrastructure and stay permanently on, matching PT Distinction's own Tools tab (only ever toggles tracking modules,
// never account/billing screens).
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
  'Strength',
  'Progress & Photos',
  'Body Scans',
];

// Narrows + defensively filters raw DB strings against the real allowlist, so a stray/stale
// row can never accidentally hide a core screen.
export function toDisabledScreenSet(raw: string[]): Set<Screen> {
  const allowed = new Set(DISABLEABLE_SCREENS);
  return new Set(raw.filter((s): s is Screen => allowed.has(s as Screen)));
}

// Layers a membership tier's screen access under the client's own per-client toggles -- the
// tier (package.included_screens) sets the ceiling of what a client on it can ever see;
// clientDisabled can only take away further, never restore what the tier excludes. null
// tierIncludedScreens means the tier doesn't restrict anything, matching every package that
// predates this feature. Recomputed from the caller's current membership on every call --
// there's no synced/stored "effective" state, so a package edit or reassignment takes effect
// on the client's very next load.
export function toEffectiveDisabledScreenSet(clientDisabled: string[], tierIncludedScreens: string[] | null): Set<Screen> {
  const disabled = toDisabledScreenSet(clientDisabled);
  if (tierIncludedScreens !== null) {
    const included = new Set(tierIncludedScreens);
    for (const screen of DISABLEABLE_SCREENS) {
      if (!included.has(screen)) disabled.add(screen);
    }
  }
  return disabled;
}

export type NutritionMode = 'full_tracking' | 'manual_import' | 'photo_diary';

// What the member app shows, given the screens switched off. Tabs that would be empty are hidden rather than left blank.
export interface MemberAreas {
  food: boolean;
  workouts: boolean;
  overview: boolean;
  strength: boolean; // load volume and lift progression (a plan lists it in included_screens, 0118)
  photos: boolean; // "Progress & Photos" covers both the photo grid and the measurements
  scans: boolean;
  progress: boolean; // any of the four above
  forms: boolean;
  weeklyLog: boolean; // the daily check-in
  education: boolean; // Resources / courses
  recipes: boolean;
  mealPlanner: boolean;
  activity: boolean; // the step swap
}

export function memberAreas(disabled: Set<Screen>, nutritionMode: NutritionMode = 'full_tracking'): MemberAreas {
  const overview = !disabled.has('Overview');
  const strength = !disabled.has('Strength');
  const photos = !disabled.has('Progress & Photos');
  const scans = !disabled.has('Body Scans');
  return {
    // The photo diary is not switchable, so a member on it always keeps the Food tab (it tells them where it lives).
    food: nutritionMode === 'photo_diary' ? true : !disabled.has('Food Tracking'),
    workouts: !disabled.has('Workout'),
    overview,
    strength,
    photos,
    scans,
    progress: overview || strength || photos || scans,
    forms: !disabled.has('Forms'),
    weeklyLog: !disabled.has('Weekly Log'),
    education: !disabled.has('Education'),
    recipes: !disabled.has('Recipes'),
    mealPlanner: !disabled.has('Meal Planner'),
    activity: !disabled.has('Activity'),
  };
}

// The package that applies to a member: their membership's package, or null when they have none (no limit).
export function tierScreens(membership: { package: { included_screens: string[] | null } | null } | null | undefined): string[] | null {
  return membership?.package?.included_screens ?? null;
}
