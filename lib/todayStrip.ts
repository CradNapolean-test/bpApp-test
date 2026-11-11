// D15 (owner, 11 Nov 2026): a Today strip on member Home, under the greeting: today's workout, and calories and protein left today.
// Only wording and subtraction here: the day's target comes from dayTargetFor (the same one the food diary uses), which takes every
// number from calculations.ts. The phone has the same rules in packages/shared/src/utils/todayStrip.ts.

export type NutritionMode = 'full_tracking' | 'manual_import' | 'photo_diary';

export type FoodLeft =
  // A photo-diary member logs meals as photos: no calorie numbers anywhere for them.
  | { kind: 'photo_diary' }
  // The plan is waiting for the coach (targetsHeldBack) and there is no target of the member's own.
  | { kind: 'held' }
  | { kind: 'no_target' }
  | { kind: 'numbers'; caloriesLeft: number; proteinLeft: number };

export function foodLeft(input: {
  mode: NutritionMode | null | undefined;
  held: boolean;
  target: { calories: number; protein: number } | null;
  eaten: { calories: number; protein: number };
}): FoodLeft {
  if (input.mode === 'photo_diary') return { kind: 'photo_diary' };
  if (!input.target) return input.held ? { kind: 'held' } : { kind: 'no_target' };
  return {
    kind: 'numbers',
    caloriesLeft: Math.round(input.target.calories - input.eaten.calories),
    proteinLeft: Math.round(input.target.protein - input.eaten.protein),
  };
}

export interface StripText {
  label: string;
  title: string;
  detail: string;
  // The title is a warning (over the day's calories).
  over?: boolean;
}

export function foodStripText(f: FoodLeft): StripText {
  switch (f.kind) {
    case 'photo_diary':
      return { label: 'Food today', title: 'Photo diary', detail: 'Add a meal photo' };
    case 'held':
      return { label: 'Food today', title: 'Plan being set up', detail: 'Targets once your coach checks it' };
    case 'no_target':
      return { label: 'Food today', title: 'No targets yet', detail: 'Open your food diary' };
    case 'numbers': {
      const over = f.caloriesLeft < 0;
      return {
        label: 'Left today',
        title: over ? `${Math.abs(f.caloriesLeft).toLocaleString('en-GB')} kcal over` : `${f.caloriesLeft.toLocaleString('en-GB')} kcal`,
        detail: f.proteinLeft > 0 ? `${f.proteinLeft} g protein` : 'Protein target hit',
        over,
      };
    }
  }
}

// Today's workout, as each platform already works it out (web: from the programmes on the page; phone: useTodayWorkout).
export type StripWorkout =
  | { status: 'workout'; dayLabel: string | null; highlights: string[]; exerciseCount: number; weekNum: number; done: boolean }
  | { status: 'rest_day'; weekNum: number }
  | { status: 'ended' }
  | { status: 'no_start_date'; programName: string }
  // No programme running (none, or the next one has not started): the strip leaves the workout out.
  | { status: 'none' };

export function workoutStripText(w: StripWorkout): StripText | null {
  const label = "Today's workout";
  switch (w.status) {
    case 'none':
      return null;
    case 'workout': {
      const name = w.dayLabel?.trim();
      const lifts = w.highlights.join(' · ');
      const what = name ? lifts || `${w.exerciseCount} exercise${w.exerciseCount === 1 ? '' : 's'}` : `Week ${w.weekNum}`;
      return { label, title: name || lifts || 'Workout', detail: w.done ? `Done today ✓ · ${what}` : what };
    }
    case 'rest_day':
      return { label, title: 'Rest day', detail: `Week ${w.weekNum} · see the week` };
    case 'ended':
      return { label, title: 'Programme finished', detail: 'See your training' };
    case 'no_start_date':
      return { label, title: w.programName, detail: 'No start date yet: ask your coach' };
  }
}
